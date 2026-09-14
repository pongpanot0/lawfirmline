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
