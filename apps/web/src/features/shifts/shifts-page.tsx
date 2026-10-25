import { ArrowRight, CheckCircle2, Eye, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { formatScheduleDate } from '@/features/schedules/types';
import { OccupancyBar } from './occupancy-bar';
import { useSetShiftActive, useShifts } from './shifts-api';
import type { ShiftRecord } from './types';

const PAGE_SIZE = 10;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function ShiftsPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page')) || 1);
  const rawFrom = params.get('from') ?? '';
  const rawTo = params.get('to') ?? '';
  const from = DATE_PATTERN.test(rawFrom) ? rawFrom : '';
  const to = DATE_PATTERN.test(rawTo) ? rawTo : '';
  const status = params.get('status');
  const active = status === 'active' ? true : status === 'inactive' ? false : undefined;

  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ShiftRecord | null>(null);

  const shifts = useShifts({
    page,
    pageSize: PAGE_SIZE,
    from: from || undefined,
    to: to || undefined,
    active,
  });
  const setActive = useSetShiftActive();

  function updateParams(changes: Record<string, string | undefined>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  async function confirmToggle() {
    if (!pending) return;
    const next = !pending.active;
    setError(null);
    try {
      await setActive.mutateAsync({ id: pending.id, active: next });
      setNotice(next ? 'El turno fue activado.' : 'El turno fue desactivado.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cambiar el estado.');
    } finally {
      setPending(null);
    }
  }

  const data = shifts.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Turnos</h1>
          <p className="text-muted-foreground">
            Une ruta, horario, bus y conductor, y asigna pasajeros.
          </p>
        </div>
        <Button asChild>
          <Link to="/turnos/nuevo">
            <Plus className="size-4" aria-hidden />
            Nuevo turno
          </Link>
        </Button>
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

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-4 border-b bg-muted/60 p-4">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Desde
            <Input
              type="date"
              aria-label="Desde"
              className="w-auto"
              value={from}
              onChange={(event) => updateParams({ from: event.target.value, page: undefined })}
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Hasta
            <Input
              type="date"
              aria-label="Hasta"
              className="w-auto"
              value={to}
              onChange={(event) => updateParams({ to: event.target.value, page: undefined })}
            />
          </label>
          <Select
            aria-label="Filtrar por estado"
            className="w-auto"
            value={status ?? ''}
            onChange={(event) => updateParams({ status: event.target.value, page: undefined })}
          >
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-background text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha y hora</th>
                <th className="px-4 py-3 font-semibold">Ruta</th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">Bus y conductor</th>
                <th className="px-4 py-3 font-semibold">Ocupación</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shifts.isPending && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando turnos…
                  </td>
                </tr>
              )}
              {shifts.isError && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-danger">
                    No se pudieron cargar los turnos.{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => shifts.refetch()}
                    >
                      Reintentar
                    </button>
                  </td>
                </tr>
              )}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No hay turnos que coincidan con los filtros.
                  </td>
                </tr>
              )}
              {data?.items.map((shift) => (
                <tr key={shift.id} className="h-16 hover:bg-muted/60">
                  <td className="whitespace-nowrap px-4 py-2">
                    <p className="font-medium">{formatScheduleDate(shift.schedule.date)}</p>
                    <p className="tnum text-xs text-muted-foreground">
                      {shift.schedule.departureTime} – {shift.schedule.arrivalTime}
                    </p>
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
                  <td className="min-w-32 px-4 py-2">
                    <p className="tnum mb-1 text-xs font-medium">
                      {shift.passengerCount} / {shift.bus.seats}
                    </p>
                    <OccupancyBar passengers={shift.passengerCount} seats={shift.bus.seats} />
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={shift.active ? 'success' : 'neutral'}>
                      {shift.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={`/turnos/${shift.id}`}
                          aria-label={`Ver turno de ${shift.route.origin} a ${shift.route.destination}`}
                        >
                          <Eye className="size-4" aria-hidden />
                          Ver
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={`/turnos/${shift.id}/editar`}
                          aria-label={`Editar turno de ${shift.route.origin} a ${shift.route.destination}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Editar
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPending(shift)}
                        aria-label={`${shift.active ? 'Desactivar' : 'Activar'} turno de ${shift.route.origin} a ${shift.route.destination}`}
                      >
                        {shift.active ? (
                          <PowerOff className="size-4" aria-hidden />
                        ) : (
                          <Power className="size-4" aria-hidden />
                        )}
                        {shift.active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : undefined })}
          />
        )}
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.active ? 'Desactivar turno' : 'Activar turno'}
        description={
          pending?.active
            ? 'El bus y el conductor quedarán libres para ese horario. Los pasajeros asignados se conservan.'
            : 'Se volverá a comprobar que el bus, el conductor y los pasajeros no tengan otro turno a esa hora.'
        }
        confirmLabel={pending?.active ? 'Desactivar' : 'Activar'}
        destructive={pending?.active}
        loading={setActive.isPending}
        onConfirm={confirmToggle}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
