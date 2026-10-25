import { CheckCircle2, Pencil, Plus, Power, PowerOff, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useBuses, useSetBusStatus } from './buses-api';
import {
  BUS_STATUS_LABEL,
  BUS_STATUS_TONE,
  BUS_STATUSES,
  type BusRecord,
  type BusStatus,
} from './types';

const PAGE_SIZE = 10;

function isOneOf<T extends string>(value: string | null, options: readonly T[]): T | undefined {
  return options.find((option) => option === value);
}

export function BusesPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page')) || 1);
  const search = params.get('search') ?? '';
  const status = isOneOf(params.get('status'), BUS_STATUSES);

  const [searchInput, setSearchInput] = useState(search);
  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<BusRecord | null>(null);

  const buses = useBuses({ page, pageSize: PAGE_SIZE, search, status });
  const setStatus = useSetBusStatus();

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

  const retiring = pending !== null && pending.status !== 'RETIRED';

  async function confirmStatusChange() {
    if (!pending) return;
    const next: BusStatus = pending.status === 'RETIRED' ? 'ACTIVE' : 'RETIRED';
    setError(null);
    try {
      await setStatus.mutateAsync({ id: pending.id, status: next });
      setNotice(
        next === 'RETIRED'
          ? `El bus ${pending.plate} fue dado de baja.`
          : `El bus ${pending.plate} fue reactivado.`,
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cambiar el estado.');
    } finally {
      setPending(null);
    }
  }

  const data = buses.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Buses</h1>
          <p className="text-muted-foreground">Administra la flota y su disponibilidad.</p>
        </div>
        <Button asChild>
          <Link to="/buses/nuevo">
            <Plus className="size-4" aria-hidden />
            Nuevo bus
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
        <div className="grid gap-3 border-b bg-muted/60 p-4 sm:grid-cols-[1fr_200px]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Buscar buses"
              placeholder="Buscar por placa, marca o modelo"
              className="pl-10"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Select
            aria-label="Filtrar por estado"
            value={status ?? ''}
            onChange={(event) => updateParams({ status: event.target.value, page: undefined })}
          >
            <option value="">Todos los estados</option>
            {BUS_STATUSES.map((value) => (
              <option key={value} value={value}>
                {BUS_STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-background text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Placa</th>
                <th className="px-4 py-3 font-semibold">Marca y modelo</th>
                <th className="px-4 py-3 text-right font-semibold">Asientos</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {buses.isPending && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando buses…
                  </td>
                </tr>
              )}
              {buses.isError && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-danger">
                    No se pudieron cargar los buses.{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => buses.refetch()}
                    >
                      Reintentar
                    </button>
                  </td>
                </tr>
              )}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No hay buses que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
              {data?.items.map((row) => (
                <tr key={row.id} className="h-14 hover:bg-muted/60">
                  <td className="tnum px-4 py-2 font-semibold">{row.plate}</td>
                  <td className="px-4 py-2">
                    <p className="font-medium">{row.brand}</p>
                    <p className="text-xs text-muted-foreground">{row.model}</p>
                  </td>
                  <td className="tnum px-4 py-2 text-right">{row.seats}</td>
                  <td className="px-4 py-2">
                    <Badge tone={BUS_STATUS_TONE[row.status]}>{BUS_STATUS_LABEL[row.status]}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/buses/${row.id}/editar`} aria-label={`Editar bus ${row.plate}`}>
                          <Pencil className="size-4" aria-hidden />
                          Editar
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPending(row)}
                        aria-label={`${row.status === 'RETIRED' ? 'Reactivar' : 'Dar de baja'} bus ${row.plate}`}
                      >
                        {row.status === 'RETIRED' ? (
                          <Power className="size-4" aria-hidden />
                        ) : (
                          <PowerOff className="size-4" aria-hidden />
                        )}
                        {row.status === 'RETIRED' ? 'Reactivar' : 'Dar de baja'}
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
        title={retiring ? 'Dar de baja el bus' : 'Reactivar el bus'}
        description={
          retiring
            ? `El bus ${pending?.plate} quedará fuera de servicio. Podrás reactivarlo cuando quieras.`
            : `El bus ${pending?.plate} volverá a estar activo.`
        }
        confirmLabel={retiring ? 'Dar de baja' : 'Reactivar'}
        destructive={retiring}
        loading={setStatus.isPending}
        onConfirm={confirmStatusChange}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
