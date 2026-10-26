import { ArrowRight, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { formatScheduleDate } from '@/features/schedules/types';
import { ApiError } from '@/lib/api';
import { useDeleteReport, useReports } from './reports-api';
import { formatDateTime, type ReportRecord } from './types';

const PAGE_SIZE = 10;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface ReportsListTabProps {
  onNotice: (message: string) => void;
}

/** Informes por turno: observaciones del administrador sobre un viaje. */
export function ReportsListTab({ onNotice }: ReportsListTabProps) {
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page')) || 1);
  const search = params.get('search') ?? '';
  const from = DATE_PATTERN.test(params.get('from') ?? '') ? params.get('from')! : '';
  const to = DATE_PATTERN.test(params.get('to') ?? '') ? params.get('to')! : '';

  const [searchInput, setSearchInput] = useState(search);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReportRecord | null>(null);

  const reports = useReports({
    page,
    pageSize: PAGE_SIZE,
    from: from || undefined,
    to: to || undefined,
    search: search || undefined,
  });
  const remove = useDeleteReport();

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

  // La búsqueda espera a que se deje de escribir antes de consultar.
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(
      () => updateParams({ search: searchInput.trim(), page: undefined }),
      300,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  async function confirmDelete() {
    if (!pending) return;
    setError(null);
    try {
      await remove.mutateAsync(pending.id);
      onNotice('El informe fue eliminado.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo eliminar el informe.');
    } finally {
      setPending(null);
    }
  }

  const data = reports.data;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild>
          <Link to="/reportes/nuevo">
            <Plus className="size-4" aria-hidden />
            Nuevo informe
          </Link>
        </Button>
      </div>

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
          <div className="relative min-w-60 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Buscar en las observaciones"
              placeholder="Buscar en las observaciones"
              className="pl-10"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-background text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Turno</th>
                <th className="px-4 py-3 font-semibold">Observaciones</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Autor</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reports.isPending && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando informes…
                  </td>
                </tr>
              )}
              {reports.isError && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-danger">
                    No se pudieron cargar los informes.{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => reports.refetch()}
                    >
                      Reintentar
                    </button>
                  </td>
                </tr>
              )}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No hay informes que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
              {data?.items.map((report) => {
                const label = `${report.shift.route.origin} a ${report.shift.route.destination}`;
                return (
                  <tr key={report.id} className="align-top hover:bg-muted/60">
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="font-medium">{formatScheduleDate(report.shift.date)}</p>
                      <p className="tnum text-xs text-muted-foreground">
                        {report.shift.departureTime} – {report.shift.arrivalTime} ·{' '}
                        {report.shift.bus.plate}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs">
                        <span>{report.shift.route.origin}</span>
                        <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                        <span>{report.shift.route.destination}</span>
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="line-clamp-2 max-w-md whitespace-pre-line">{report.notes}</p>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">
                      <p className="font-medium">{report.author.fullName}</p>
                      <p className="tnum text-xs text-muted-foreground">
                        {formatDateTime(report.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            to={`/reportes/${report.id}/editar`}
                            aria-label={`Editar informe de ${label}`}
                          >
                            <Pencil className="size-4" aria-hidden />
                            Editar
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPending(report)}
                          aria-label={`Eliminar informe de ${label}`}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
        title="Eliminar informe"
        description="Se eliminará el informe de este turno. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
