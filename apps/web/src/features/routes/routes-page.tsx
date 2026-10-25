import { ArrowRight, CheckCircle2, Pencil, Plus, Power, PowerOff, Search } from 'lucide-react';
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
import { useRoutes, useSetRouteActive } from './routes-api';
import { ACTIVE_FILTER_LABEL, type ActiveFilter, type RouteRecord } from './types';

const PAGE_SIZE = 10;
const FILTERS = Object.keys(ACTIVE_FILTER_LABEL) as ActiveFilter[];

function parseFilter(value: string | null): ActiveFilter | undefined {
  return FILTERS.find((filter) => filter === value);
}

export function RoutesPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page')) || 1);
  const search = params.get('search') ?? '';
  const filter = parseFilter(params.get('status'));

  const [searchInput, setSearchInput] = useState(search);
  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<RouteRecord | null>(null);

  const routes = useRoutes({
    page,
    pageSize: PAGE_SIZE,
    search,
    active: filter === undefined ? undefined : filter === 'active',
  });
  const setActive = useSetRouteActive();

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

  async function confirmChange() {
    if (!pending) return;
    const next = !pending.active;
    const label = `${pending.origin} → ${pending.destination}`;
    setError(null);
    try {
      await setActive.mutateAsync({ id: pending.id, active: next });
      setNotice(next ? `La ruta ${label} fue activada.` : `La ruta ${label} fue desactivada.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cambiar el estado.');
    } finally {
      setPending(null);
    }
  }

  const data = routes.data;
  const deactivating = pending?.active === true;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rutas</h1>
          <p className="text-muted-foreground">
            Define los recorridos entre puntos de salida y llegada.
          </p>
        </div>
        <Button asChild>
          <Link to="/rutas/nuevo">
            <Plus className="size-4" aria-hidden />
            Nueva ruta
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
              aria-label="Buscar rutas"
              placeholder="Buscar por origen o destino"
              className="pl-10"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Select
            aria-label="Filtrar por estado"
            value={filter ?? ''}
            onChange={(event) => updateParams({ status: event.target.value, page: undefined })}
          >
            <option value="">Todos los estados</option>
            {FILTERS.map((value) => (
              <option key={value} value={value}>
                {ACTIVE_FILTER_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-background text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Ruta</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {routes.isPending && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando rutas…
                  </td>
                </tr>
              )}
              {routes.isError && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-danger">
                    No se pudieron cargar las rutas.{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => routes.refetch()}
                    >
                      Reintentar
                    </button>
                  </td>
                </tr>
              )}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    No hay rutas que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
              {data?.items.map((row) => (
                <tr key={row.id} className="h-14 hover:bg-muted/60">
                  <td className="px-4 py-2">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span>{row.origin}</span>
                      <ArrowRight className="size-4 text-muted-foreground" aria-label="hacia" />
                      <span>{row.destination}</span>
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={row.active ? 'success' : 'neutral'}>
                      {row.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={`/rutas/${row.id}/editar`}
                          aria-label={`Editar la ruta ${row.origin} a ${row.destination}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Editar
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPending(row)}
                        aria-label={`${row.active ? 'Desactivar' : 'Activar'} la ruta ${row.origin} a ${row.destination}`}
                      >
                        {row.active ? (
                          <PowerOff className="size-4" aria-hidden />
                        ) : (
                          <Power className="size-4" aria-hidden />
                        )}
                        {row.active ? 'Desactivar' : 'Activar'}
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
        title={deactivating ? 'Desactivar ruta' : 'Activar ruta'}
        description={
          deactivating
            ? `La ruta ${pending?.origin} → ${pending?.destination} dejará de poder asignarse a nuevos turnos. Podrás reactivarla cuando quieras.`
            : `La ruta ${pending?.origin} → ${pending?.destination} volverá a estar disponible.`
        }
        confirmLabel={deactivating ? 'Desactivar' : 'Activar'}
        destructive={deactivating}
        loading={setActive.isPending}
        onConfirm={confirmChange}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
