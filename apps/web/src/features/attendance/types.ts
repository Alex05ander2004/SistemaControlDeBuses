import type {
  Attendance,
  PassengerRecord,
  ShiftDetail,
  ShiftRecord,
} from '@/features/shifts/types';

export interface AttendanceSummary {
  present: number;
  absent: number;
  pending: number;
}

/** Turno tal como lo devuelve GET /my/shifts: los campos extra dependen del rol. */
export interface MyShift extends ShiftRecord {
  /** Solo conductor. */
  summary?: AttendanceSummary;
  /** Solo conductor: true si la fecha del turno es hoy o ya pasó. */
  canMark?: boolean;
  /** El servidor decide qué es "hoy" (zona horaria de la app); ausente en respuestas antiguas. */
  isToday?: boolean;
  /** Solo colaborador. */
  myAttendance?: Attendance;
  markedAt?: string | null;
}

export interface DriverShiftDetail extends ShiftDetail {
  summary: AttendanceSummary;
  canMark: boolean;
  isToday?: boolean;
}

export interface OverviewShift extends ShiftRecord {
  summary: AttendanceSummary;
}

export interface AttendanceOverview {
  /** AAAA-MM-DD */
  date: string;
  items: OverviewShift[];
}

export interface MyShiftsQuery {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
}

export interface MarkedPassenger {
  workerId: string;
  fullName: string;
  dni: string;
  attendance: Attendance;
  markedAt: string | null;
}

export type { PassengerRecord };

const pad = (value: number) => String(value).padStart(2, '0');

/** Fecha de hoy en la zona horaria del navegador, como AAAA-MM-DD. */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function summarize(passengers: PassengerRecord[]): AttendanceSummary {
  const summary: AttendanceSummary = { present: 0, absent: 0, pending: 0 };
  for (const passenger of passengers) {
    if (passenger.attendance === 'PRESENT') summary.present += 1;
    else if (passenger.attendance === 'ABSENT') summary.absent += 1;
    else summary.pending += 1;
  }
  return summary;
}

export function markedCount(summary: AttendanceSummary): number {
  return summary.present + summary.absent;
}

const timeFormatter = new Intl.DateTimeFormat('es', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "2026-11-02T11:12:00.000Z" → "06:12" (hora local del navegador). */
export function formatMarkedAt(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

export type AttendanceFilter = 'ALL' | Attendance;

export const FILTER_LABEL: Record<AttendanceFilter, string> = {
  ALL: 'Todos',
  PENDING: 'Pendientes',
  PRESENT: 'Asistieron',
  ABSENT: 'Faltaron',
};
