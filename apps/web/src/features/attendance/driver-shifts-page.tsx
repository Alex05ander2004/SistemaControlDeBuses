import { ArrowRight, Bus, ChevronRight, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { formatScheduleDate } from '@/features/schedules/types';
import { OccupancyBar } from '@/features/shifts/occupancy-bar';
import { MarkedProgress } from './attendance-bars';
import { useMyShifts } from './attendance-api';
import { todayLocal } from './types';

export function DriverShiftsPage() {
  const shifts = useMyShifts({ page: 1, pageSize: 50 });
  const today = todayLocal();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mis turnos</h1>
        <p className="text-muted-foreground">Elige un turno para marcar la asistencia.</p>
      </div>

      {shifts.isPending && <p className="text-muted-foreground">Cargando turnos…</p>}
      {shifts.isError && (
        <div
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-3 text-sm text-danger-soft-foreground"
        >
          No se pudieron cargar tus turnos.{' '}
          <button type="button" className="font-medium underline" onClick={() => shifts.refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {shifts.data && shifts.data.items.length === 0 && (
        <p className="rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground shadow-card">
          No tienes turnos programados.
        </p>
      )}

      <ul className="space-y-3">
        {shifts.data?.items.map((shift) => {
          const summary = shift.summary ?? { present: 0, absent: 0, pending: shift.passengerCount };
          return (
            <li key={shift.id}>
              <Link
                to={`/conductor/turnos/${shift.id}`}
                className="block rounded-xl border bg-card p-4 shadow-card transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {formatScheduleDate(shift.schedule.date)}
                    {(shift.isToday ?? shift.schedule.date === today) && (
                      <Badge tone="info">Hoy</Badge>
                    )}
                  </p>
                  <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                </div>

                <p className="tnum mt-1 flex items-center gap-1.5 text-2xl font-semibold tracking-tight">
                  <Clock className="size-5 text-primary" aria-hidden />
                  {shift.schedule.departureTime} – {shift.schedule.arrivalTime}
                </p>

                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-base font-medium">
                  <span>{shift.route.origin}</span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  <span>{shift.route.destination}</span>
                </p>

                <p className="tnum mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Bus className="size-4" aria-hidden />
                  {shift.bus.plate} · {shift.passengerCount} / {shift.bus.seats} pasajeros
                </p>
                <OccupancyBar
                  passengers={shift.passengerCount}
                  seats={shift.bus.seats}
                  className="mt-2"
                />

                <MarkedProgress summary={summary} total={shift.passengerCount} className="mt-4" />
                {shift.canMark === false && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Podrás marcar la asistencia el día del turno.
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
