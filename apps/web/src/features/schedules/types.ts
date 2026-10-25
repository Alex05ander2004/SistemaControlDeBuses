export interface ScheduleRecord {
  id: string;
  /** AAAA-MM-DD */
  date: string;
  /** HH:mm */
  departureTime: string;
  /** HH:mm */
  arrivalTime: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SchedulesQuery {
  page: number;
  pageSize: number;
  /** AAAA-MM-DD, inclusivo */
  from?: string;
  /** AAAA-MM-DD, inclusivo */
  to?: string;
}

export interface ScheduleInput {
  date: string;
  departureTime: string;
  arrivalTime: string;
}

const dateFormatter = new Intl.DateTimeFormat('es', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  // La fecha llega como AAAA-MM-DD sin zona: se formatea en UTC para no desplazar el día.
  timeZone: 'UTC',
});

/** "2026-11-02" → "lun 2 nov 2026" */
export function formatScheduleDate(date: string): string {
  const parts = dateFormatter.formatToParts(new Date(`${date}T00:00:00.000Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((item) => item.type === type)?.value ?? '').replace(/\.$/, '');
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
}

export function minutesBetween(departure: string, arrival: string): number {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(arrival) - toMinutes(departure);
}

/** 90 → "1 h 30 min", 45 → "45 min", 120 → "2 h" */
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return '—';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
