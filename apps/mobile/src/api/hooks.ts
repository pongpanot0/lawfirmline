import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import { calendarRangeQuery } from '../format';
import type { DailyWorkboard } from '@lawfirm/shared';
import type {
  AppNotification,
  CalendarEventItem,
  CaseDetail,
  CaseListItem,
  CourtDayResponse,
  CourtDayState,
  DashboardStats,
  LeaveItem,
  MyDayResponse,
  NotificationPreference,
  OwnerKpis,
  OwnerFinance,
  TaskItem,
  WorkloadResponse,
} from './types';

export function useMyDay() {
  return useQuery({
    queryKey: ['my-day'],
    queryFn: () => api<MyDayResponse>('/agenda/my-day'),
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api<DashboardStats>('/dashboard/stats'),
  });
}

export function useCases(search: string) {
  return useQuery({
    queryKey: ['cases', search],
    queryFn: () =>
      api<CaseListItem[] | { items: CaseListItem[] }>(
        search ? `/cases?search=${encodeURIComponent(search)}` : '/cases',
      ).then((res) => (Array.isArray(res) ? res : res.items)),
  });
}

export function useCase(id: string) {
  return useQuery({
    queryKey: ['case', id],
    queryFn: () => api<CaseDetail>(`/cases/${id}`),
    enabled: !!id,
  });
}

export function useCaseTasks(caseId: string) {
  return useQuery({
    queryKey: ['case-tasks', caseId],
    queryFn: () => api<TaskItem[]>(`/cases/${caseId}/tasks`),
    enabled: !!caseId,
  });
}

export function useCalendarRange(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () =>
      api<CalendarEventItem[]>(`/calendar/events?${calendarRangeQuery(from, to)}`),
  });
}

export function useTodos(view: 'all' | 'mine' | 'created' | 'review' = 'all', enabled = true) {
  return useQuery({
    queryKey: ['todos', view],
    queryFn: () => api<TaskItem[]>(`/todos?view=${view}`),
    enabled,
  });
}

export function useDailyWorkboard(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['daily-workboard', date],
    queryFn: () => api<DailyWorkboard>(`/operations/daily?date=${date}`),
    enabled,
  });
}

/**
 * Optimistic done/undone: the row flips instantly, the request follows, and a
 * failure rolls the cache back. Case tasks go through /tasks/:id, standalone
 * todos through /todos/:id.
 */
export function useToggleTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, done }: { task: TaskItem; done: boolean }) => {
      const path = task.caseId
        ? `/cases/${task.caseId}/tasks/${task.id}`
        : `/todos/${task.id}`;
      return api(path, {
        method: 'PATCH',
        body: { status: done ? 'DONE' : 'TODO' },
      });
    },
    onMutate: async ({ task, done }) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] });
      const previous = queryClient.getQueriesData<TaskItem[]>({ queryKey: ['todos'] });
      queryClient.setQueriesData<TaskItem[]>({ queryKey: ['todos'] }, (rows) =>
        rows?.map((row) =>
          row.id === task.id ? { ...row, status: done ? 'DONE' : 'TODO' } : row,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [key, rows] of context?.previous ?? []) queryClient.setQueryData(key, rows);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['daily-workboard'] });
      queryClient.invalidateQueries({ queryKey: ['my-day'] });
    },
  });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; assigneeId: string }) =>
      api<TaskItem>('/todos', { method: 'POST', body }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['my-day'] });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
      queryClient.invalidateQueries({ queryKey: ['team-radar'] });
      queryClient.invalidateQueries({ queryKey: ['person-workload'] });
    },
  });
}

export function useCreateCaseTask(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) =>
      api(`/cases/${caseId}/tasks`, { method: 'POST', body: { title } }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
    },
  });
}

export interface CreateEventBody {
  caseId: string;
  title: string;
  startAt: string;
  type?: string;
  courtName?: string;
  assigneeIds?: string[];
}

export function useCourts() {
  return useQuery({ queryKey: ['courts'], queryFn: () => api<Array<{ id: string; name: string }>>('/courts') });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventBody) =>
      api<CalendarEventItem>('/calendar/events', { method: 'POST', body }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['case-events'] });
      queryClient.invalidateQueries({ queryKey: ['my-day'] });
    },
  });
}

/** Action Center: everything waiting on someone — the app's notification feed. */
export interface ActionItem {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  caseRef: string | null;
  owner: string | null;
  dueAt: string | null;
  url: string;
}

export function useActions() {
  return useQuery({
    queryKey: ['actions'],
    queryFn: () => api<{ items: ActionItem[]; limited: boolean }>('/agenda/actions'),
  });
}

export interface Lawyer {
  id: string;
  firstName: string;
  lastName: string;
  firmRole?: import('@lawfirm/shared').FirmRole | null;
}

export function useLawyers() {
  return useQuery({
    queryKey: ['lawyers'],
    queryFn: () => api<Lawyer[]>('/users/lawyers'),
    staleTime: 10 * 60 * 1000,
  });
}

export function useReassignTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      caseId,
      taskId,
      assigneeId,
    }: {
      caseId?: string | null;
      taskId: string;
      assigneeId: string;
    }) =>
      api(caseId ? `/cases/${caseId}/tasks/${taskId}/reassign` : `/todos/${taskId}`, {
        method: 'PATCH',
        body: { assigneeId },
      }),
    onSettled: (_data, _error, { caseId, taskId }) => {
      if (caseId) queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['team-radar'] });
      queryClient.invalidateQueries({ queryKey: ['person-workload'] });
      queryClient.invalidateQueries({ queryKey: ['daily-workboard'] });
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['my-day'] });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
    },
  });
}

export function useLeaves(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['leaves', from, to],
    queryFn: () => api<LeaveItem[]>(`/leaves?from=${from}&to=${to}`),
    enabled,
  });
}

export function usePendingLeaves(enabled: boolean) {
  return useQuery({ queryKey: ['leaves', 'pending'], enabled, queryFn: () => api<LeaveItem[]>('/leaves/pending') });
}

export function useDecideLeave() {
  const client = useQueryClient();
  return useMutation({ retry: false,
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) => api<LeaveItem>(`/leaves/${id}/decision`, { method: 'PATCH', body: { decision } }),
    onSettled: () => { for (const key of ['leaves', 'team-radar', 'person-workload', 'daily-workboard', 'actions']) void client.invalidateQueries({ queryKey: [key] }); },
  });
}

export function useOwnerFinance(enabled: boolean, month?: string) {
  return useQuery({ queryKey: ['owner-finance', month ?? 'current'], enabled,
    queryFn: () => api<OwnerFinance>(`/invoices/owner-worklist${month ? `?month=${month}` : ''}`) });
}

export function useWorkload(enabled = true) {
  return useQuery({
    queryKey: ['workload'],
    queryFn: () => api<WorkloadResponse>('/dashboard/workload'),
    enabled,
  });
}

export interface ClientListItem {
  id: string;
  name: string;
  type: string | null;
  contacts?: ClientContact[];
  cases?: Array<{ id: string; ownRef: string; title: string; status: string }>;
}

export interface ClientContact {
  id: string;
  name: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
}

export function useClients(search: string) {
  return useQuery({
    queryKey: ['clients', search],
    queryFn: () =>
      api<ClientListItem[]>(
        search ? `/clients?search=${encodeURIComponent(search)}` : '/clients',
      ),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: () => api<ClientListItem>(`/clients/${id}`),
    enabled: !!id,
  });
}

export interface ExpenseItem {
  id: string;
  amount: number;
  description: string;
  category: string | null;
  status: string;
  date: string;
  billable?: boolean;
  receiptPath?: string | null;
  receiptFilename?: string | null;
  claimId?: string | null;
  userId?: string;
  case?: { id: string; ownRef: string; title: string } | null;
  user?: { id: string; firstName: string; lastName: string } | null;
}

export function useExpenses() {
  return useQuery({
    queryKey: ['expenses'],
    queryFn: () => api<ExpenseItem[]>('/expenses'),
  });
}

export function useSubmitExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseIds: string[]) =>
      api<ExpenseClaim>('/expenses/submit', { method: 'POST', body: { expenseIds } }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-claims'] });
    },
  });
}


export function useCreateIntake() {
  return useMutation({
    mutationFn: (body: {
      receivedDate: string;
      title?: string;
      clientName?: string;
      matterType?: string;
      description?: string;
    }) => api('/intake', { method: 'POST', body }),
  });
}

export interface InsuranceClaim {
  id: string;
  insurerName: string;
  policyNumber: string | null;
  claimNumber: string | null;
  stage: string;
  incidentDate: string;
  demandLetterDeadline: string | null;
}

export function useInsuranceClaim(caseId: string) {
  return useQuery({
    queryKey: ['insurance-claim', caseId],
    queryFn: () => api<InsuranceClaim | null>(`/cases/${caseId}/insurance-claim`),
    enabled: !!caseId,
  });
}

export interface ReportsSummary {
  scope: 'firm' | 'user';
  kpis: {
    casesClosedYtd: number;
    casesClosedChange: number;
    winRate: number;
    avgCaseDurationMonths: number;
  };
  caseVolumeByType: Array<{ label: string; count: number }>;
  revenueByLawyer: Array<{ lawyerName: string; hours: number; revenue: number }>;
  expenseSummary?: { total?: number; byCategory?: Array<{ category: string; amount: number }> };
}

export function useReportsSummary() {
  return useQuery({
    queryKey: ['reports-summary'],
    queryFn: () => api<ReportsSummary>('/reports/summary'),
  });
}

/** OWNER only — pass `enabled` from the user's firm role so non-owners never hit the 403. */
export function useOwnerKpis(enabled: boolean) {
  return useQuery({
    queryKey: ['owner-kpis'],
    queryFn: () => api<OwnerKpis>('/operations/owner-kpis'),
    enabled,
    retry: false,
  });
}

export interface KnowledgeItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  createdAt: string;
  caseId: string;
  case?: { id: string; ownRef: string; title: string } | null;
}

export function useKnowledge(search: string) {
  return useQuery({
    queryKey: ['knowledge', search],
    queryFn: () =>
      api<KnowledgeItem[]>(
        search ? `/knowledge?search=${encodeURIComponent(search)}` : '/knowledge',
      ),
  });
}

export interface OnHoldItem {
  taskId: string;
  taskTitle: string;
  caseId: string | null;
  caseTitle: string | null;
  caseOwnRef: string | null;
  assigneeName: string | null;
  reason?: string | null;
  nextFollowUpAt?: string | null;
  followerName?: string | null;
}

/** OwnerOnly on the API — a 403 here means the caller is not the Firm Owner. */
export function useOnHoldTasks() {
  return useQuery({
    queryKey: ['operations-onhold'],
    queryFn: () => api<OnHoldItem[]>('/operations/onhold'),
    retry: false,
  });
}

export function useCourtDay(eventId: string) {
  return useQuery({
    queryKey: ['court-day', eventId],
    queryFn: () => api<CourtDayResponse>(`/calendar/events/${eventId}/court-day`),
    enabled: !!eventId,
  });
}

export function useSaveCourtDay(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ version, state }: { version: number; state: CourtDayState }) =>
      api<CourtDayResponse['workspace']>(`/calendar/events/${eventId}/court-day`, {
        method: 'PATCH',
        body: { version, state },
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['court-day', eventId] }),
  });
}

export interface ExpenseClaim {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';
  submittedAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
  submittedBy: Lawyer;
  totalAmount: number;
  itemCount: number;
  receiptCount: number;
  cases: Array<{ id: string; ownRef: string; title: string }>;
  expenses: ExpenseItem[];
}

export function useExpenseClaims(enabled = true) {
  return useQuery({
    queryKey: ['expense-claims'],
    queryFn: () => api<ExpenseClaim[]>('/expense-claims'),
    enabled,
  });
}

export function useExpenseClaim(id: string) {
  return useQuery({
    queryKey: ['expense-claims', id],
    queryFn: () => api<ExpenseClaim>(`/expense-claims/${id}`),
    enabled: !!id,
  });
}

export function useReviewClaim(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (status: 'APPROVED' | 'PAID' | 'REJECTED') =>
      api<ExpenseClaim>(`/expense-claims/${id}/status`, { method: 'PATCH', body: { status } }),
    retry: false,
    onSuccess: (data) => client.setQueryData(['expense-claims', id], data),
    onSettled: () => {
      client.invalidateQueries({ queryKey: ['expense-claims'] });
      client.invalidateQueries({ queryKey: ['expenses'] });
      client.invalidateQueries({ queryKey: ['owner-finance'] });
    },
  });
}

export function useRequestLeave() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: LeaveItem['type']; startDate: string; endDate: string }) =>
      api<LeaveItem>('/leaves', { method: 'POST', body }),
    retry: false,
    onSettled: () => {
      client.invalidateQueries({ queryKey: ['leaves'] });
      client.invalidateQueries({ queryKey: ['actions'] });
    },
  });
}

export function useMembers() {
  return useQuery({ queryKey: ['members'], queryFn: () => api<Lawyer[]>('/users/members') });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: () => api<CalendarEventItem>(`/calendar/events/${id}`),
    enabled: !!id,
  });
}

export function useUpdateEventTeam(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (assigneeIds: string[]) =>
      api<CalendarEventItem>(`/calendar/events/${id}`, { method: 'PATCH', body: { assigneeIds } }),
    retry: false,
    onSettled: () => {
      for (const key of ['event', 'calendar', 'case-events', 'my-day', 'court-day', 'workload']) {
        client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useCompleteCourtDay(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { version: number; eventUpdatedAt: string }) =>
      api<CourtDayResponse['workspace']>(`/calendar/events/${id}/court-day/complete`, { method: 'POST', body }),
    retry: false,
    onSettled: () => {
      for (const key of ['court-day', 'my-day', 'calendar', 'case-events', 'case-tasks', 'expenses']) {
        client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** The staff inbox, newest first; pages follow the server's cursor. */
export function useNotificationInbox() {
  return useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) =>
      api<{ items: AppNotification[]; nextCursor: string | null }>(
        pageParam ? `/notifications?cursor=${pageParam}` : '/notifications',
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useUnreadNotifications() {
  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api<{ count: number }>('/notifications/unread-count').then((res) => res.count),
    refetchInterval: 60 * 1000,
  });
}

/** Refresh everything a new notification can change. */
export function invalidateNotifications(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
  queryClient.invalidateQueries({ queryKey: ['actions'] });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSettled: () => invalidateNotifications(queryClient),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSettled: () => invalidateNotifications(queryClient),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api<NotificationPreference[]>('/notifications/preferences'),
  });
}

export function useUpdateNotificationPreference() {
  const queryClient = useQueryClient();
  const key = ['notification-preferences'];
  const mutationKey = ['update-notification-preference'];
  type Change = Pick<NotificationPreference, 'category'> & Partial<Omit<NotificationPreference, 'category'>>;
  return useMutation({
    mutationKey,
    mutationFn: ({ category, ...change }: Change) =>
      api<NotificationPreference>(`/notifications/preferences/${category}`, { method: 'PATCH', body: change }),
    // A switch must move when tapped, not a round trip later.
    onMutate: async ({ category, ...change }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<NotificationPreference[]>(key)?.find((row) => row.category === category);
      queryClient.setQueryData<NotificationPreference[]>(key, (rows) =>
        rows?.map((row) => (row.category === category ? { ...row, ...change } : row)));
      return { before };
    },
    // Undo only the switch that failed, so a quick second tap elsewhere survives.
    onError: (_error, { category, ...change }, context) => {
      if (!context?.before) return;
      const undo = Object.fromEntries(Object.keys(change).map((field) => [field, context.before![field as 'push' | 'line']]));
      queryClient.setQueryData<NotificationPreference[]>(key, (rows) =>
        rows?.map((row) => (row.category === category ? { ...row, ...undo } : row)));
    },
    // Refetch once the last pending toggle settles, not between taps.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) <= 1) queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
