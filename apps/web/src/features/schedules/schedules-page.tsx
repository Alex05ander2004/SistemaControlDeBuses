import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { ApiError } from '@/lib/api';
import { useDeleteSchedule, useSchedules } from './schedules-api';
import { formatDuration, formatScheduleDate, minutesBetween, type ScheduleRecord } from './types';

const PAGE_SIZE = 10;
const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

function dateParam(value: string | null): string | undefined {
  return value && DATE_PARAM.test(value) ? value : undefined;
}

export function SchedulesPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page')) || 1);
  const from = dateParam(params.get('from'));
  const to = dateParam(params.get('to'));

  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ScheduleRecord | null>(null);

  const schedules = useSchedules({ page, pageSize: PAGE_SIZE, from, to });
  const remove = useDeleteSchedule();

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

  async function confirmDelete() {
    if (!pending) return;
    setError(null);
    setNotice(null);
    try {
      await remove.mutateAsync(pending.id);
      setNotice(
        `Se eliminó el horario del ${formatScheduleDate(pending.date)} (${pending.departureTime} – ${pending.arrivalTime}).`,
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo eliminar el horario.');
    } finally {
      setPending(null);
    }
  }

  const data = schedules.data;
  const hasFilters = Boolean(from || to);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Horarios</h1>
          <p className="text-muted-foreground">Fechas y horas de salida y llegada de los viajes.</p>
        </div>
        <Button asChild>
          <Link to="/horarios/nuevo">
            <Plus className="size-4" aria-hidden />
            Nuevo horario
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
        <div className="flex flex-wrap items-end gap-3 border-b bg-muted/60 p-4">
          <div className="space-y-1">
            <Label htmlFor="filter-from" className="text-xs text-muted-foreground">
              Desde
            </Label>
            <Input
              id="filter-from"
              type="date"
              className="w-44"
              value={from ?? ''}
              max={to}
              onChange={(event) => updateParams({ from: event.target.value, page: undefined })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-to" className="text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input
              id="filter-to"
              type="date"
              className="w-44"
              value={to ?? ''}
              min={from}
              onChange={(event) => updateParams({ to: event.target.value, page: undefined })}
            />
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateParams({ from: undefined, to: undefined, page: undefined })}
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-background text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Salida</th>
                <th className="px-4 py-3 font-semibold">Llegada</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Duración</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {schedules.isPending && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando horarios…
                  </td>
                </tr>
              )}
              {schedules.isError && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-danger">
                    No se pudieron cargar los horarios.{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => schedules.refetch()}
                    >
                      Reintentar
                    </button>
                  </td>
                </tr>
              )}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {hasFilters
                      ? 'No hay horarios en el rango de fechas elegido.'
                      : 'Aún no hay horarios registrados.'}
                  </td>
                </tr>
              )}
              {data?.items.map((row) => (
                <tr key={row.id} className="h-14 hover:bg-muted/60">
                  <td className="px-4 py-2 font-medium capitalize">
                    {formatScheduleDate(row.date)}
                  </td>
                  <td className="tnum px-4 py-2">{row.departureTime}</td>
                  <td className="tnum px-4 py-2">{row.arrivalTime}</td>
                  <td className="tnum hidden px-4 py-2 text-muted-foreground sm:table-cell">
                    {formatDuration(minutesBetween(row.departureTime, row.arrivalTime))}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={`/horarios/${row.id}/editar`}
                          aria-label={`Editar horario del ${formatScheduleDate(row.date)} de ${row.departureTime} a ${row.arrivalTime}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Editar
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPending(row)}
                        aria-label={`Eliminar horario del ${formatScheduleDate(row.date)} de ${row.departureTime} a ${row.arrivalTime}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Eliminar
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
        title="Eliminar horario"
        description={
          pending
            ? `Se eliminará el horario del ${formatScheduleDate(pending.date)} (${pending.departureTime} – ${pending.arrivalTime}). Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
