/** Fecha de hoy (AAAA-MM-DD) en la zona horaria indicada. */
export function todayIn(timeZone: string, now = new Date()): string {
  // El locale en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Convierte AAAA-MM-DD a Date UTC a medianoche, como se guardan las columnas @db.Date. */
export function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Suma (o resta) días a una fecha AAAA-MM-DD. */
export function addDays(date: string, days: number): string {
  const result = dateOnly(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** Días enteros entre dos fechas AAAA-MM-DD (to - from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / 86_400_000);
}

/** Fecha y hora (AAAA-MM-DD HH:mm) de un instante en la zona horaria indicada. */
export function formatDateTimeIn(timeZone: string, value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}
