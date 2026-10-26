import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiBlob, apiFetch } from '@/lib/api';
import type {
  AttendanceReport,
  AttendanceReportQuery,
  Page,
  ReportRecord,
  ReportsQuery,
} from './types';

export function toQueryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

/** Sin from/to el servidor usa los últimos 30 días y devuelve las fechas que usó. */
export function useAttendanceReport(query: AttendanceReportQuery) {
  return useQuery({
    queryKey: ['reports', 'attendance', query],
    queryFn: () => apiFetch<AttendanceReport>(`/reports/attendance?${toQueryString(query)}`),
    placeholderData: keepPreviousData,
  });
}

/** Descarga el CSV con los mismos filtros de la tabla (sin paginación). */
export function downloadAttendanceCsv(filters: Omit<AttendanceReportQuery, 'page' | 'pageSize'>) {
  const query = toQueryString(filters);
  return apiBlob(`/reports/attendance.csv${query ? `?${query}` : ''}`, 'asistencia.csv');
}

export function useReports(query: ReportsQuery) {
  return useQuery({
    queryKey: ['reports', 'list', query],
    queryFn: () => apiFetch<Page<ReportRecord>>(`/reports?${toQueryString(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: ['reports', 'detail', id],
    queryFn: () => apiFetch<ReportRecord>(`/reports/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { shiftId: string; notes: string }) =>
      apiFetch<ReportRecord>('/reports', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
  });
}

export function useUpdateReport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { notes: string }) =>
      apiFetch<ReportRecord>(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/reports/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
  });
}
