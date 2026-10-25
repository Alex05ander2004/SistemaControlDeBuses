import { ArrowLeft, ArrowRight, Bus, Check, Clock, Info, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatScheduleDate } from '@/features/schedules/types';
import { ATTENDANCE_LABEL, ATTENDANCE_TONE, type Attendance } from '@/features/shifts/types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDriverShift, useMarkAttendance } from './attendance-api';
import { MarkedProgress } from './attendance-bars';
import {
  FILTER_LABEL,
  formatMarkedAt,
  summarize,
  todayLocal,
  type AttendanceFilter,
} from './types';

const FILTERS: AttendanceFilter[] = ['ALL', 'PENDING', 'PRESENT', 'ABSENT'];

export function DriverShiftPage() {
  const { id } = useParams();
  const shift = useDriverShift(id);
  const mark = useMarkAttendance(id ?? '');

  const [filter, setFilter] = useState<AttendanceFilter>('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const passengers = useMemo(() => shift.data?.passengers ?? [], [shift.data]);
  const counts = useMemo(() => summarize(passengers), [passengers]);
  const filterCounts: Record<AttendanceFilter, number> = {
    ALL: passengers.length,
    PENDING: counts.pending,
    PRESENT: counts.present,
    ABSENT: counts.absent,
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return passengers.filter(
      (passenger) =>
        (filter === 'ALL' || passenger.attendance === filter) &&
        (term === '' ||
          passenger.fullName.toLowerCase().includes(term) ||
          passenger.dni.includes(term)),
    );
  }, [passengers, filter, search]);

  if (shift.isPending) return <p className="text-muted-foreground">Cargando turno…</p>;
  if (shift.isError || !shift.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <p role="alert" className="text-danger">
          {shift.error instanceof ApiError && shift.error.status === 404
            ? 'El turno no existe o no es tuyo.'
            : 'No se pudo cargar el turno.'}
        </p>
        <Button asChild variant="secondary">
          <Link to="/conductor">Volver a mis turnos</Link>
        </Button>
      </div>
    );
  }

  const data = shift.data;
  const canMark = data.canMark;

  /** Pulsar el estado actual lo deshace (vuelve a Pendiente). */
  async function toggle(workerId: string, current: Attendance, target: 'PRESENT' | 'ABSENT') {
    setError(null);
    try {
      await mark.mutateAsync({ workerId, attendance: current === target ? 'PENDING' : target });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo registrar la asistencia.');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-3">
        <Link
          to="/conductor"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Mis turnos
        </Link>
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {formatScheduleDate(data.schedule.date)}
            {(data.isToday ?? data.schedule.date === todayLocal()) && (
              <Badge tone="info">Hoy</Badge>
            )}
          </p>
          <h1 className="flex flex-wrap items-center gap-x-2 text-2xl font-bold tracking-tight">
            <span>{data.route.origin}</span>
            <ArrowRight className="size-5 text-primary" aria-hidden />
            <span>{data.route.destination}</span>
          </h1>
          <p className="tnum flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              {data.schedule.departureTime} – {data.schedule.arrivalTime}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Bus className="size-4" aria-hidden />
              {data.bus.plate}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="tnum text-2xl font-semibold text-success-soft-foreground">
            {counts.present}
          </p>
          <p className="text-xs text-muted-foreground">Asistieron</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="tnum text-2xl font-semibold text-danger-soft-foreground">{counts.absent}</p>
          <p className="text-xs text-muted-foreground">Faltaron</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="tnum text-2xl font-semibold text-info-soft-foreground">{counts.pending}</p>
          <p className="text-xs text-muted-foreground">Pendientes</p>
        </Card>
      </div>
      <MarkedProgress summary={counts} total={passengers.length} />

      {!canMark && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Podrás marcar la asistencia el día del turno.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground"
        >
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Buscar pasajeros"
            placeholder="Buscar por nombre o DNI"
            className="h-11 pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div
          role="tablist"
          aria-label="Filtrar por asistencia"
          className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1"
        >
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'tnum flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                filter === value
                  ? 'bg-card text-foreground shadow-card'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {FILTER_LABEL[value]} ({filterCounts[value]})
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-3">
        {passengers.length === 0 && (
          <li className="rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground shadow-card">
            Este turno aún no tiene pasajeros asignados.
          </li>
        )}
        {passengers.length > 0 && visible.length === 0 && (
          <li className="rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground shadow-card">
            Ningún pasajero coincide con el filtro.
          </li>
        )}
        {visible.map((passenger) => {
          const busy = mark.isPending && mark.variables?.workerId === passenger.workerId;
          const present = passenger.attendance === 'PRESENT';
          const absent = passenger.attendance === 'ABSENT';
          return (
            <li key={passenger.workerId} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{passenger.fullName}</p>
                  <p className="tnum text-xs text-muted-foreground">DNI {passenger.dni}</p>
                </div>
                <Badge tone={ATTENDANCE_TONE[passenger.attendance]}>
                  {ATTENDANCE_LABEL[passenger.attendance]}
                </Badge>
              </div>
              {passenger.markedAt && (
                <p className="tnum mt-1 text-xs text-muted-foreground">
                  Marcado a las {formatMarkedAt(passenger.markedAt)}
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="lg"
                  variant={present ? 'default' : 'secondary'}
                  aria-pressed={present}
                  aria-label={`Asistió: ${passenger.fullName}`}
                  disabled={!canMark || busy}
                  onClick={() => toggle(passenger.workerId, passenger.attendance, 'PRESENT')}
                  className={cn(
                    'h-14 text-base',
                    present
                      ? 'bg-success hover:bg-success/90 active:bg-success/80'
                      : 'border-success/40 text-success-soft-foreground',
                  )}
                >
                  <Check className="size-5" aria-hidden />
                  Asistió
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant={absent ? 'destructive' : 'secondary'}
                  aria-pressed={absent}
                  aria-label={`Faltó: ${passenger.fullName}`}
                  disabled={!canMark || busy}
                  onClick={() => toggle(passenger.workerId, passenger.attendance, 'ABSENT')}
                  className={cn(
                    'h-14 text-base',
                    !absent && 'border-danger/40 text-danger-soft-foreground',
                  )}
                >
                  <X className="size-5" aria-hidden />
                  Faltó
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
