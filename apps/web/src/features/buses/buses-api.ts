import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { BusInput, BusRecord, BusesQuery, BusStatus, Paginated } from './types';

function toQueryString(query: BusesQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useBuses(query: BusesQuery) {
  return useQuery({
    queryKey: ['buses', 'list', query],
    queryFn: () => apiFetch<Paginated<BusRecord>>(`/buses?${toQueryString(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useBus(id: string | undefined) {
  return useQuery({
    queryKey: ['buses', 'detail', id],
    queryFn: () => apiFetch<BusRecord>(`/buses/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateBus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BusInput) =>
      apiFetch<BusRecord>('/buses', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['buses'] }),
  });
}

export function useUpdateBus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<BusInput>) =>
      apiFetch<BusRecord>(`/buses/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['buses'] }),
  });
}

/** Cambia el estado desde el listado (dar de baja o reactivar). */
export function useSetBusStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BusStatus }) =>
      apiFetch<BusRecord>(`/buses/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['buses'] }),
  });
}
