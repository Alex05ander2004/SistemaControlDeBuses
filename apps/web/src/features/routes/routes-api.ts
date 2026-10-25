import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Paginated, RouteInput, RouteRecord, RoutesQuery } from './types';

function toQueryString(query: RoutesQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useRoutes(query: RoutesQuery) {
  return useQuery({
    queryKey: ['routes', 'list', query],
    queryFn: () => apiFetch<Paginated<RouteRecord>>(`/routes?${toQueryString(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useRoute(id: string | undefined) {
  return useQuery({
    queryKey: ['routes', 'detail', id],
    queryFn: () => apiFetch<RouteRecord>(`/routes/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RouteInput) =>
      apiFetch<RouteRecord>('/routes', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routes'] }),
  });
}

export function useUpdateRoute(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<RouteInput>) =>
      apiFetch<RouteRecord>(`/routes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routes'] }),
  });
}

/** Activa o desactiva una ruta desde el listado. */
export function useSetRouteActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<RouteRecord>(`/routes/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routes'] }),
  });
}
