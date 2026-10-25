import { ArrowRight, Bus, Clock, UserCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatScheduleDate } from '@/features/schedules/types';
import { ATTENDANCE_LABEL, ATTENDANCE_TONE } from '@/features/shifts/types';
import { useMyShifts } from './attendance-api';
import { formatMarkedAt, todayLocal } from './types';

export function WorkerShiftsPage() {
  const shifts = useMyShifts({ page: 1, pageSize: 50 });
  const today = todayLocal();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mis turnos</h1>
        <p className="text-muted-foreground">Tus próximos viajes y el estado de tu asistencia.</p>
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
          No tienes turnos asignados.
        </p>
      )}

      <ul className="space-y-3">
        {shifts.data?.items.map((shift) => {
          const attendance = shift.myAttendance ?? 'PENDING';
          return (
            <li key={shift.id} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {formatScheduleDate(shift.schedule.date)}
                  {(shift.isToday ?? shift.schedule.date === today) && (
                    <Badge tone="info">Hoy</Badge>
                  )}
                </p>
                <Badge tone={ATTENDANCE_TONE[attendance]}>{ATTENDANCE_LABEL[attendance]}</Badge>
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

              <div className="mt-3 grid gap-2 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-2">
                <p className="flex items-center gap-2">
                  <Bus className="size-4 text-muted-foreground" aria-hidden />
                  <span className="tnum font-medium">{shift.bus.plate}</span>
                </p>
                <p className="flex items-center gap-2">
                  <UserCircle className="size-4 text-muted-foreground" aria-hidden />
                  <span>{shift.driver.fullName}</span>
                </p>
              </div>

              {shift.markedAt && (
                <p className="tnum mt-2 text-xs text-muted-foreground">
                  Marcado a las {formatMarkedAt(shift.markedAt)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
