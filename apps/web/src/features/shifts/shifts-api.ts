import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { ShiftDetail, ShiftInput, ShiftRecord, ShiftsQuery } from './types';

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function toQueryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useShifts(query: ShiftsQuery) {
  return useQuery({
    queryKey: ['shifts', 'list', query],
    queryFn: () => apiFetch<Page<ShiftRecord>>(`/shifts?${toQueryString(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useShift(id: string | undefined) {
  return useQuery({
    queryKey: ['shifts', 'detail', id],
    queryFn: () => apiFetch<ShiftDetail>(`/shifts/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ShiftInput) =>
      apiFetch<ShiftRecord>('/shifts', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });
}

export function useUpdateShift(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ShiftInput>) =>
      apiFetch<ShiftRecord>(`/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });
}

/** Activa o desactiva cualquier turno (desde el listado o el detalle). */
export function useSetShiftActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<ShiftRecord>(`/shifts/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });
}

export function useAddPassengers(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workerIds: string[]) =>
      apiFetch<ShiftDetail>(`/shifts/${id}/passengers`, {
        method: 'POST',
        body: JSON.stringify({ workerIds }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });
}

export function useRemovePassenger(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workerId: string) =>
      apiFetch<void>(`/shifts/${id}/passengers/${workerId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
  });
}

/* Opciones para los selectores del formulario y del panel de pasajeros. El API limita a 100 por página. */

export interface RouteOption {
  id: string;
  origin: string;
  destination: string;
}
export interface ScheduleOption {
  id: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
}
export interface BusOption {
  id: string;
  plate: string;
  seats: number;
}
export interface PersonOption {
  id: string;
  fullName: string;
  dni: string;
}

const OPTIONS_STALE_MS = 30_000;

export function useRouteOptions() {
  return useQuery({
    queryKey: ['shifts', 'options', 'routes'],
    queryFn: () => apiFetch<Page<RouteOption>>('/routes?active=true&pageSize=100'),
    staleTime: OPTIONS_STALE_MS,
  });
}

/** Horarios desde hoy en adelante (UTC, igual que las fechas del API). */
export function useScheduleOptions() {
  const today = new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ['shifts', 'options', 'schedules', today],
    queryFn: () => apiFetch<Page<ScheduleOption>>(`/schedules?from=${today}&pageSize=100`),
    staleTime: OPTIONS_STALE_MS,
  });
}

export function useBusOptions() {
  return useQuery({
    queryKey: ['shifts', 'options', 'buses'],
    queryFn: () => apiFetch<Page<BusOption>>('/buses?status=ACTIVE&pageSize=100'),
    staleTime: OPTIONS_STALE_MS,
  });
}

export function usePeopleOptions(role: 'DRIVER' | 'WORKER') {
  return useQuery({
    queryKey: ['shifts', 'options', 'people', role],
    queryFn: () => apiFetch<Page<PersonOption>>(`/users?role=${role}&status=ACTIVE&pageSize=100`),
    staleTime: OPTIONS_STALE_MS,
  });
}
