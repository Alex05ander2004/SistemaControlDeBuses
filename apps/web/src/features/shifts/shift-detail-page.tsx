import {
  ArrowLeft,
  ArrowRight,
  Bus,
  CalendarDays,
  CheckCircle2,
  Clock,
  Pencil,
  Power,
  PowerOff,
  UserCircle,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDuration, formatScheduleDate, minutesBetween } from '@/features/schedules/types';
import { ApiError } from '@/lib/api';
import { AssignPassengersPanel } from './assign-passengers-panel';
import { OccupancyBar } from './occupancy-bar';
import { useRemovePassenger, useSetShiftActive, useShift } from './shifts-api';
import { ATTENDANCE_LABEL, ATTENDANCE_TONE, occupancy, type PassengerRecord } from './types';

export function ShiftDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const shift = useShift(id);
  const setActive = useSetShiftActive();
  const removePassenger = useRemovePassenger(id ?? '');

  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const [removing, setRemoving] = useState<PassengerRecord | null>(null);

  if (shift.isPending) return <p className="text-muted-foreground">Cargando turno…</p>;
  if (shift.isError || !shift.data) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-danger">
          {shift.error instanceof ApiError && shift.error.status === 404
            ? 'El turno no existe.'
            : 'No se pudo cargar el turno.'}
        </p>
        <Button asChild variant="secondary">
          <Link to="/turnos">Volver a turnos</Link>
        </Button>
      </div>
    );
  }

  const data = shift.data;
  const free = data.bus.seats - data.passengerCount;
  const duration = formatDuration(
    minutesBetween(data.schedule.departureTime, data.schedule.arrivalTime),
  );

  async function confirmToggle() {
    setError(null);
    try {
      await setActive.mutateAsync({ id: data.id, active: !data.active });
      setNotice(data.active ? 'El turno fue desactivado.' : 'El turno fue activado.');
      if (data.active) setAssigning(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cambiar el estado.');
    } finally {
      setTogglePending(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setError(null);
    try {
      await removePassenger.mutateAsync(removing.workerId);
      setNotice(`${removing.fullName} fue quitado del turno.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo quitar al pasajero.');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          to="/turnos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Turnos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge tone={data.active ? 'success' : 'neutral'}>
              {data.active ? 'Activo' : 'Inactivo'}
            </Badge>
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-bold tracking-tight">
              <span>{data.route.origin}</span>
              <ArrowRight className="size-6 text-primary" aria-hidden />
              <span>{data.route.destination}</span>
            </h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden />
                {formatScheduleDate(data.schedule.date)}
              </span>
              <span className="tnum inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden />
                {data.schedule.departureTime} – {data.schedule.arrivalTime} ({duration})
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link to={`/turnos/${data.id}/editar`}>
                <Pencil className="size-4" aria-hidden />
                Editar
              </Link>
            </Button>
            <Button variant="secondary" onClick={() => setTogglePending(true)}>
              {data.active ? (
                <PowerOff className="size-4" aria-hidden />
              ) : (
                <Power className="size-4" aria-hidden />
              )}
              {data.active ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success-soft-foreground"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Unidad
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Bus className="size-5" aria-hidden />
            </div>
            <div>
              <p className="tnum text-xl font-semibold">{data.bus.plate}</p>
              <p className="text-sm text-muted-foreground">{data.bus.seats} asientos</p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Conductor
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-warning-soft text-warning">
              <UserCircle className="size-5" aria-hidden />
            </div>
            <p className="text-lg font-semibold">{data.driver.fullName}</p>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Capacidad y asientos
          </p>
          <p className="tnum mt-3 text-[28px] font-semibold leading-none tracking-tight">
            {data.passengerCount}
            <span className="text-lg font-normal text-muted-foreground"> / {data.bus.seats}</span>
          </p>
          <OccupancyBar passengers={data.passengerCount} seats={data.bus.seats} className="mt-3" />
          <p className="tnum mt-2 text-xs text-muted-foreground">
            {occupancy(data.passengerCount, data.bus.seats)} % de ocupación · {free}{' '}
            {free === 1 ? 'libre' : 'libres'}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">Manifiesto de pasajeros</h2>
          </div>
          <Button
            onClick={() => setAssigning(true)}
            disabled={!data.active || free <= 0 || assigning}
          >
            <UserPlus className="size-4" aria-hidden />
            Asignar pasajeros
          </Button>
        </div>

        {!data.active && (
          <p className="border-b bg-muted/60 px-4 py-2 text-sm text-muted-foreground">
            El turno está inactivo: actívalo para asignar pasajeros.
          </p>
        )}
        {data.active && free <= 0 && (
          <p className="border-b bg-muted/60 px-4 py-2 text-sm text-muted-foreground">
            El bus está lleno: quita un pasajero para asignar a otro.
          </p>
        )}

        {assigning && (
          <div className="border-b p-4">
            <AssignPassengersPanel
              shift={data}
              onCancel={() => setAssigning(false)}
              onDone={(count) => {
                setAssigning(false);
                setNotice(
                  count === 1 ? 'Se asignó 1 pasajero.' : `Se asignaron ${count} pasajeros.`,
                );
              }}
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-background text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-16 px-4 py-3 font-semibold">N.º</th>
                <th className="px-4 py-3 font-semibold">Colaborador</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">DNI</th>
                <th className="px-4 py-3 font-semibold">Asistencia</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.passengers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Aún no hay pasajeros asignados a este turno.
                  </td>
                </tr>
              )}
              {data.passengers.map((passenger, index) => (
                <tr key={passenger.workerId} className="h-14 hover:bg-muted/60">
                  <td className="tnum px-4 py-2 text-muted-foreground">{index + 1}</td>
                  <td className="px-4 py-2 font-medium">{passenger.fullName}</td>
                  <td className="tnum hidden px-4 py-2 sm:table-cell">{passenger.dni}</td>
                  <td className="px-4 py-2">
                    <Badge tone={ATTENDANCE_TONE[passenger.attendance]}>
                      {ATTENDANCE_LABEL[passenger.attendance]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoving(passenger)}
                      disabled={passenger.attendance !== 'PENDING'}
                      aria-label={`Quitar a ${passenger.fullName}`}
                      title={
                        passenger.attendance !== 'PENDING'
                          ? 'Ya tiene la asistencia registrada'
                          : undefined
                      }
                    >
                      <UserMinus className="size-4" aria-hidden />
                      Quitar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={togglePending}
        title={data.active ? 'Desactivar turno' : 'Activar turno'}
        description={
          data.active
            ? 'El bus y el conductor quedarán libres para ese horario. Los pasajeros asignados se conservan.'
            : 'Se volverá a comprobar que el bus, el conductor y los pasajeros no tengan otro turno a esa hora.'
        }
        confirmLabel={data.active ? 'Desactivar' : 'Activar'}
        destructive={data.active}
        loading={setActive.isPending}
        onConfirm={confirmToggle}
        onCancel={() => setTogglePending(false)}
      />
      <ConfirmDialog
        open={removing !== null}
        title="Quitar pasajero"
        description={`${removing?.fullName} dejará de estar asignado a este turno y se liberará su asiento.`}
        confirmLabel="Quitar"
        destructive
        loading={removePassenger.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
