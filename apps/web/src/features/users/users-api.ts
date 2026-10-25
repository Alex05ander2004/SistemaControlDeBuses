import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Paginated, UserInput, UserRecord, UsersQuery } from './types';

function toQueryString(query: UsersQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useUsers(query: UsersQuery) {
  return useQuery({
    queryKey: ['users', 'list', query],
    queryFn: () => apiFetch<Paginated<UserRecord>>(`/users?${toQueryString(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['users', 'detail', id],
    queryFn: () => apiFetch<UserRecord>(`/users/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UserInput) =>
      apiFetch<UserRecord>('/users', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<UserInput>) =>
      apiFetch<UserRecord>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

/** Cambia el estado de cualquier usuario desde el listado (activar o desactivar). */
export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserRecord['status'] }) =>
      apiFetch<UserRecord>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
