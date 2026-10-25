import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attendance, ShiftDetail } from '@/features/shifts/types';
import { apiFetch } from '@/lib/api';
import type {
  AttendanceOverview,
  DriverShiftDetail,
  MarkedPassenger,
  MyShift,
  MyShiftsQuery,
} from './types';

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

/** Turnos propios: el conductor ve los que conduce y el colaborador los suyos como pasajero. */
export function useMyShifts(query: MyShiftsQuery) {
  return useQuery({
    queryKey: ['attendance', 'my-shifts', query],
    queryFn: () => apiFetch<Page<MyShift>>(`/my/shifts?${toQueryString(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useDriverShift(id: string | undefined) {
  return useQuery({
    queryKey: ['attendance', 'driver-shift', id],
    queryFn: () => apiFetch<DriverShiftDetail>(`/my/shifts/${id}`),
    enabled: Boolean(id),
  });
}

/** Sin `date` el servidor usa "hoy" en su zona horaria y devuelve la fecha resultante. */
export function useAttendanceOverview(date?: string) {
  return useQuery({
    queryKey: ['attendance', 'overview', date ?? 'today'],
    queryFn: () =>
      apiFetch<AttendanceOverview>(`/attendance/overview${date ? `?date=${date}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

type DetailCache = Pick<ShiftDetail, 'passengers'> | undefined;

/**
 * Marca la asistencia de un pasajero. La interfaz se actualiza al instante (en la vista del
 * conductor y en el detalle del administrador) y se revierte si el servidor rechaza el cambio.
 */
export function useMarkAttendance(shiftId: string) {
  const queryClient = useQueryClient();
  const detailKeys = [
    ['attendance', 'driver-shift', shiftId],
    ['shifts', 'detail', shiftId],
  ] as const;

  return useMutation({
    mutationFn: ({ workerId, attendance }: { workerId: string; attendance: Attendance }) =>
      apiFetch<MarkedPassenger>(`/shifts/${shiftId}/passengers/${workerId}/attendance`, {
        method: 'PATCH',
        body: JSON.stringify({ attendance }),
      }),
    onMutate: async ({ workerId, attendance }) => {
      await Promise.all(detailKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const previous = detailKeys.map(
        (key) => [key, queryClient.getQueryData<DetailCache>(key)] as const,
      );
      const markedAt = attendance === 'PENDING' ? null : new Date().toISOString();

      for (const key of detailKeys) {
        queryClient.setQueryData<DetailCache>(key, (old) =>
          old
            ? {
                ...old,
                passengers: old.passengers.map((passenger) =>
                  passenger.workerId === workerId
                    ? { ...passenger, attendance, markedAt }
                    : passenger,
                ),
              }
            : old,
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
  });
}
