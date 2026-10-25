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
