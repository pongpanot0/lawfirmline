import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import type {
  CalendarEventItem,
  CaseDetail,
  CaseListItem,
  CourtDayResponse,
  CourtDayState,
  DashboardStats,
  MyDayResponse,
  OwnerKpis,
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
      api<CalendarEventItem[]>(`/calendar/events?from=${from}&to=${to}`),
  });
}

export function useTodos() {
  return useQuery({
    queryKey: ['todos'],
    queryFn: () => api<TaskItem[]>('/todos'),
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
      const previous = queryClient.getQueryData<TaskItem[]>(['todos']);
      queryClient.setQueryData<TaskItem[]>(['todos'], (rows) =>
        rows?.map((row) =>
          row.id === task.id ? { ...row, status: done ? 'DONE' : 'TODO' } : row,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['todos'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['my-day'] });
    },
  });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) =>
      api('/todos', { method: 'POST', body: { title } }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['my-day'] });
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
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventBody) =>
      api('/calendar/events', { method: 'POST', body }),
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
      caseId: string;
      taskId: string;
      assigneeId: string;
    }) =>
      api(`/cases/${caseId}/tasks/${taskId}/reassign`, {
        method: 'PATCH',
        body: { assigneeId },
      }),
    onSettled: (_data, _error, { caseId }) => {
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
    },
  });
}

export function useWorkload() {
  return useQuery({
    queryKey: ['workload'],
    queryFn: () => api<WorkloadResponse>('/dashboard/workload'),
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
      api('/expenses/submit', { method: 'POST', body: { expenseIds } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
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

/** OWNER only — 403s for everyone else, so don't retry the failure. */
export function useOwnerKpis() {
  return useQuery({
    queryKey: ['owner-kpis'],
    queryFn: () => api<OwnerKpis>('/operations/owner-kpis'),
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
      api(`/calendar/events/${eventId}/court-day`, {
        method: 'PATCH',
        body: { version, state },
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['court-day', eventId] }),
  });
}
