import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Paginated, ScheduleInput, ScheduleRecord, SchedulesQuery } from './types';

function toQueryString(query: SchedulesQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useSchedules(query: SchedulesQuery) {
  return useQuery({
    queryKey: ['schedules', 'list', query],
    queryFn: () => apiFetch<Paginated<ScheduleRecord>>(`/schedules?${toQueryString(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useSchedule(id: string | undefined) {
  return useQuery({
    queryKey: ['schedules', 'detail', id],
    queryFn: () => apiFetch<ScheduleRecord>(`/schedules/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScheduleInput) =>
      apiFetch<ScheduleRecord>('/schedules', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });
}

export function useUpdateSchedule(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ScheduleInput>) =>
      apiFetch<ScheduleRecord>(`/schedules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });
}
