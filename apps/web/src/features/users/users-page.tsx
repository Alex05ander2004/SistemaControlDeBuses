import { CheckCircle2, Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-context';
import { ROLE_LABEL, type Role } from '@/features/auth/types';
import { ApiError } from '@/lib/api';
import { STATUS_LABEL, type UserRecord, type UserStatus } from './types';
import { useSetUserStatus, useUsers } from './users-api';

const PAGE_SIZE = 10;
const ROLES: Role[] = ['ADMIN', 'DRIVER', 'WORKER'];
const STATUSES: UserStatus[] = ['ACTIVE', 'INACTIVE'];

const ROLE_TONE = { ADMIN: 'info', DRIVER: 'warning', WORKER: 'neutral' } as const;

function isOneOf<T extends string>(value: string | null, options: readonly T[]): T | undefined {
  return options.find((option) => option === value);
}

export function UsersPage() {
  const { user: me } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page')) || 1);
  const search = params.get('search') ?? '';
  const role = isOneOf(params.get('role'), ROLES);
  const status = isOneOf(params.get('status'), STATUSES);

  const [searchInput, setSearchInput] = useState(search);
  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<UserRecord | null>(null);

  const users = useUsers({ page, pageSize: PAGE_SIZE, search, role, status });
  const setStatus = useSetUserStatus();

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

  async function confirmStatusChange() {
    if (!pending) return;
    const next: UserStatus = pending.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setError(null);
    try {
      await setStatus.mutateAsync({ id: pending.id, status: next });
      setNotice(
        next === 'INACTIVE'
          ? `${pending.fullName} fue desactivado.`
          : `${pending.fullName} fue activado.`,
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cambiar el estado.');
    } finally {
      setPending(null);
    }
  }

  const data = users.data;
  const deactivating = pending?.status === 'ACTIVE';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground">Administra las cuentas, los roles y el acceso.</p>
        </div>
        <Button asChild>
          <Link to="/usuarios/nuevo">
            <Plus className="size-4" aria-hidden />
            Nuevo usuario
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
        <div className="grid gap-3 border-b bg-muted/60 p-4 sm:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Buscar usuarios"
              placeholder="Buscar por nombre, usuario, correo o DNI"
              className="pl-10"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Select
            aria-label="Filtrar por rol"
            value={role ?? ''}
            onChange={(event) => updateParams({ role: event.target.value, page: undefined })}
          >
            <option value="">Todos los roles</option>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por estado"
            value={status ?? ''}
            onChange={(event) => updateParams({ status: event.target.value, page: undefined })}
          >
            <option value="">Todos los estados</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-background text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">DNI</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.isPending && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando usuarios…
                  </td>
                </tr>
              )}
              {users.isError && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-danger">
                    No se pudieron cargar los usuarios.{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => users.refetch()}
                    >
                      Reintentar
                    </button>
                  </td>
                </tr>
              )}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No hay usuarios que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
              {data?.items.map((row) => (
                <tr key={row.id} className="h-14 hover:bg-muted/60">
                  <td className="px-4 py-2">
                    <p className="font-medium">
                      {row.fullName}
                      {row.id === me?.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(tú)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{row.username} · {row.email}
                    </p>
                  </td>
                  <td className="tnum hidden px-4 py-2 md:table-cell">{row.dni}</td>
                  <td className="px-4 py-2">
                    <Badge tone={ROLE_TONE[row.role]}>{ROLE_LABEL[row.role]}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={`/usuarios/${row.id}/editar`}
                          aria-label={`Editar a ${row.fullName}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Editar
                        </Link>
                      </Button>
                      {row.id !== me?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPending(row)}
                          aria-label={`${row.status === 'ACTIVE' ? 'Desactivar' : 'Activar'} a ${row.fullName}`}
                        >
                          {row.status === 'ACTIVE' ? (
                            <UserX className="size-4" aria-hidden />
                          ) : (
                            <UserCheck className="size-4" aria-hidden />
                          )}
                          {row.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
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
        title={deactivating ? 'Desactivar usuario' : 'Activar usuario'}
        description={
          deactivating
            ? `${pending?.fullName} perderá el acceso y se cerrarán sus sesiones abiertas. Podrás reactivarlo cuando quieras.`
            : `${pending?.fullName} podrá volver a iniciar sesión.`
        }
        confirmLabel={deactivating ? 'Desactivar' : 'Activar'}
        destructive={deactivating}
        loading={setStatus.isPending}
        onConfirm={confirmStatusChange}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
