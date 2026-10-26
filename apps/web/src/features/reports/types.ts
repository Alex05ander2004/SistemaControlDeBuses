import type { Attendance } from '@/features/shifts/types';

export type { Attendance };

export interface ReportShiftRef {
  id: string;
  /** AAAA-MM-DD */
  date: string;
  /** HH:mm */
  departureTime: string;
  /** HH:mm */
  arrivalTime: string;
  route: { origin: string; destination: string };
  bus: { plate: string };
  driver: { fullName: string };
}

/** Informe por turno: observaciones escritas por un administrador. */
export interface ReportRecord {
  id: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; fullName: string };
  shift: ReportShiftRef;
}

export interface ReportsQuery {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  search?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AttendanceRow {
  shiftId: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  route: { origin: string; destination: string };
  busPlate: string;
  driverName: string;
  workerId: string;
  workerName: string;
  workerDni: string;
  attendance: Attendance;
  markedAt: string | null;
  markedBy: string | null;
}

export interface AttendanceReportSummary {
  total: number;
  present: number;
  absent: number;
  pending: number;
  /** % de asistió sobre (asistió + faltó), 1 decimal; null si aún no hay marcas. */
  attendanceRate: number | null;
}

export interface AttendanceReport extends Page<AttendanceRow> {
  /** Fechas realmente usadas por el servidor (AAAA-MM-DD). */
  from: string;
  to: string;
  summary: AttendanceReportSummary;
}

export interface AttendanceReportQuery {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  attendance?: Attendance;
}

export const MAX_NOTES_LENGTH = 2000;
export const MIN_NOTES_LENGTH = 3;

const dateTimeFormatter = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "2026-11-02T11:12:00.000Z" → "2 nov 2026, 06:12" (hora local del navegador). */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso)).replace(/\./g, '');
}

/** 87.5 → "87.5 %"; null → "—". */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${rate.toFixed(1)} %`;
}
