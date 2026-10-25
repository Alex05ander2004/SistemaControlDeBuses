export type Attendance = 'PENDING' | 'PRESENT' | 'ABSENT';

export interface ShiftRecord {
  id: string;
  active: boolean;
  route: { id: string; origin: string; destination: string; active: boolean };
  schedule: {
    id: string;
    /** AAAA-MM-DD */
    date: string;
    /** HH:mm */
    departureTime: string;
    /** HH:mm */
    arrivalTime: string;
  };
  bus: { id: string; plate: string; seats: number };
  driver: { id: string; fullName: string };
  passengerCount: number;
}

export interface PassengerRecord {
  workerId: string;
  fullName: string;
  dni: string;
  attendance: Attendance;
  /** ISO; null o ausente si aún no se marcó. */
  markedAt?: string | null;
}

export interface ShiftDetail extends ShiftRecord {
  passengers: PassengerRecord[];
}

export interface ShiftsQuery {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  active?: boolean;
}

export interface ShiftInput {
  routeId: string;
  scheduleId: string;
  busId: string;
  driverId: string;
  active?: boolean;
}

export const ATTENDANCE_LABEL: Record<Attendance, string> = {
  PENDING: 'Pendiente',
  PRESENT: 'Asistió',
  ABSENT: 'Faltó',
};

export const ATTENDANCE_TONE = {
  PENDING: 'info',
  PRESENT: 'success',
  ABSENT: 'danger',
} as const;

/** Porcentaje de ocupación acotado a 0–100. */
export function occupancy(passengers: number, seats: number): number {
  if (seats <= 0) return 0;
  return Math.min(100, Math.round((passengers / seats) * 100));
}
