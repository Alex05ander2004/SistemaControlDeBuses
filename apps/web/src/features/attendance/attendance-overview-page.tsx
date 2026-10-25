import { ArrowRight, Eye } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatScheduleDate } from '@/features/schedules/types';
import { SplitBar } from './attendance-bars';
import { useAttendanceOverview } from './attendance-api';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`tnum mt-1 text-2xl font-semibold tracking-tight ${className ?? ''}`}>
        {value}
      </p>
    </Card>
  );
}

/** Resumen de asistencia de todos los turnos de un día (solo ADMIN). */
export function AttendanceOverviewPage() {
  const [params, setParams] = useSearchParams();
  const rawDate = params.get('date') ?? '';
  const requestedDate = DATE_PATTERN.test(rawDate) ? rawDate : undefined;

  const overview = useAttendanceOverview(requestedDate);
  const data = overview.data;

  function setDate(value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set('date', value);
        else next.delete('date');
        return next;
      },
      { replace: true },
    );
  }

  const totals = (data?.items ?? []).reduce(
    (sum, shift) => ({
      passengers: sum.passengers + shift.passengerCount,
      present: sum.present + shift.summary.present,
      absent: sum.absent + shift.summary.absent,
      pending: sum.pending + shift.summary.pending,
    }),
    { passengers: 0, present: 0, absent: 0, pending: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Asistencia</h1>
          <p className="text-muted-foreground">Seguimiento del marcado de pasajeros por día.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            Fecha
            <Input
              type="date"
              aria-label="Fecha"
              className="w-auto"
              value={requestedDate ?? data?.date ?? ''}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <Button variant="secondary" onClick={() => setDate('')} disabled={!requestedDate}>
            Hoy
          </Button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Pasajeros" value={totals.passengers} />
          <Stat
            label="Asistieron"
            value={totals.present}
            className="text-success-soft-foreground"
          />
          <Stat label="Faltaron" value={totals.absent} className="text-danger-soft-foreground" />
          <Stat label="Pendientes" value={totals.pending} className="text-info-soft-foreground" />
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-background text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Hora</th>
                <th className="px-4 py-3 font-semibold">Ruta</th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">Bus y conductor</th>
                <th className="px-4 py-3 text-right font-semibold">Pasajeros</th>
                <th className="px-4 py-3 font-semibold">Asistencia</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {overview.isPending && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando asistencia…
                  </td>
                </tr>
              )}
              {overview.isError && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-danger">
                    No se pudo cargar la asistencia.{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => overview.refetch()}
                    >
                      Reintentar
                    </button>
                  </td>
                </tr>
              )}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No hay turnos el {formatScheduleDate(data.date)}.
                  </td>
                </tr>
              )}
              {data?.items.map((shift) => (
                <tr key={shift.id} className="h-16 hover:bg-muted/60">
                  <td className="tnum whitespace-nowrap px-4 py-2 font-medium">
                    {shift.schedule.departureTime} – {shift.schedule.arrivalTime}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span>{shift.route.origin}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                      <span>{shift.route.destination}</span>
                    </span>
                  </td>
                  <td className="hidden px-4 py-2 lg:table-cell">
                    <p className="tnum font-medium">{shift.bus.plate}</p>
                    <p className="text-xs text-muted-foreground">{shift.driver.fullName}</p>
                  </td>
                  <td className="tnum px-4 py-2 text-right">{shift.passengerCount}</td>
                  <td className="min-w-40 px-4 py-2">
                    <SplitBar summary={shift.summary} />
                    <p className="tnum mt-1 text-xs text-muted-foreground">
                      <span className="text-success-soft-foreground">
                        {shift.summary.present} asistió
                      </span>
                      {' · '}
                      <span className="text-danger-soft-foreground">
                        {shift.summary.absent} faltó
                      </span>
                      {' · '}
                      <span>{shift.summary.pending} pendiente</span>
                    </p>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        to={`/turnos/${shift.id}`}
                        aria-label={`Ver turno de ${shift.route.origin} a ${shift.route.destination} de ${shift.schedule.departureTime}`}
                      >
                        <Eye className="size-4" aria-hidden />
                        Ver
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
