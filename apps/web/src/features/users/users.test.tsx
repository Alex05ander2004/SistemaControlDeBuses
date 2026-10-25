import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/types';
import { UserFormPage } from './user-form-page';
import { UsersPage } from './users-page';
import type { UserRecord } from './types';

const ME: AuthUser = {
  id: 'u-admin',
  fullName: 'Carlos Mendoza',
  username: 'admin',
  role: 'ADMIN',
};

const record = (overrides: Partial<UserRecord> = {}): UserRecord => ({
  id: 'u-1',
  fullName: 'Ana López',
  username: 'ana.lopez',
  email: 'ana@airova.test',
  role: 'DRIVER',
  status: 'ACTIVE',
  dni: '10000001',
  birthDate: '1990-05-12',
  sex: 'FEMALE',
  phone: '987654321',
  address: 'Av. Los Olivos 123',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const ADMIN_ROW = record({
  id: 'u-admin',
  fullName: 'Carlos Mendoza',
  username: 'admin',
  role: 'ADMIN',
});
const ANA = record();
const LUIS = record({
  id: 'u-2',
  fullName: 'Luis Ríos',
  username: 'luis',
  email: 'luis@airova.test',
  role: 'WORKER',
  status: 'INACTIVE',
  dni: '10000002',
});

const page = (items: UserRecord[]) => ({ items, total: items.length, page: 1, pageSize: 10 });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

function mockApi(handler: Handler) {
  fetchMock.mockImplementation(async (input, init = {}) => handler(new URL(String(input)), init));
}

const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));
const callsTo = (method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === path &&
      ((init as RequestInit)?.method ?? 'GET') === method,
  );

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/usuarios', element: <UsersPage /> },
      { path: '/usuarios/nuevo', element: <UserFormPage /> },
      { path: '/usuarios/:id/editar', element: <UserFormPage /> },
    ],
    { initialEntries: [path] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{ user: ME, status: 'authenticated', login: vi.fn(), logout: vi.fn() }}
      >
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('listado de usuarios', () => {
  it('muestra los usuarios con su rol y estado, y pide la primera página', async () => {
    mockApi(() => json(200, page([ADMIN_ROW, ANA, LUIS])));
    renderAt('/usuarios');

    expect(await screen.findByText('Ana López')).toBeInTheDocument();
    expect(screen.getByText('Luis Ríos')).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Conductor')).toBeInTheDocument();
    expect(table.getByText('Inactivo')).toBeInTheDocument();

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/users');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('pageSize')).toBe('10');
  });

  it('muestra un mensaje cuando no hay resultados', async () => {
    mockApi(() => json(200, page([])));
    renderAt('/usuarios');
    expect(await screen.findByText(/No hay usuarios que coincidan/)).toBeInTheDocument();
  });

  it('permite reintentar cuando falla la carga', async () => {
    mockApi(() => json(500, { message: 'Error' }));
    renderAt('/usuarios');
    expect(await screen.findByText(/No se pudieron cargar los usuarios/)).toBeInTheDocument();

    mockApi(() => json(200, page([ANA])));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana López')).toBeInTheDocument();
  });

  it('busca después de dejar de escribir y filtra por rol', async () => {
    mockApi(() => json(200, page([ANA])));
    renderAt('/usuarios');
    await screen.findByText('Ana López');

    await userEvent.type(screen.getByLabelText('Buscar usuarios'), 'ana');
    await waitFor(() => {
      const last = new URL(String(fetchMock.mock.calls.at(-1)![0]));
      expect(last.searchParams.get('search')).toBe('ana');
    });

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por rol'), 'DRIVER');
    await waitFor(() => {
      const last = new URL(String(fetchMock.mock.calls.at(-1)![0]));
      expect(last.searchParams.get('role')).toBe('DRIVER');
      expect(last.searchParams.get('search')).toBe('ana');
    });
  });

  it('no ofrece desactivar la propia cuenta', async () => {
    mockApi(() => json(200, page([ADMIN_ROW, ANA])));
    renderAt('/usuarios');
    await screen.findByText('Ana López');

    expect(screen.queryByRole('button', { name: /Desactivar a Carlos/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar a Ana López' })).toBeInTheDocument();
    expect(screen.getByText('(tú)')).toBeInTheDocument();
  });

  it('desactiva a un usuario tras confirmar', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH' ? json(200, { ...ANA, status: 'INACTIVE' }) : json(200, page([ANA])),
    );
    renderAt('/usuarios');

    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar a Ana López' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/perderá el acceso/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Ana López fue desactivado.');
    const [patch] = callsTo('PATCH', '/users/u-1');
    expect(bodyOf(patch)).toEqual({ status: 'INACTIVE' });
  });

  it('no cambia nada si se cancela la confirmación', async () => {
    mockApi(() => json(200, page([ANA])));
    renderAt('/usuarios');

    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar a Ana López' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callsTo('PATCH', '/users/u-1')).toHaveLength(0);
  });

  it('muestra el error del servidor si no se puede cambiar el estado', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH'
        ? json(403, { message: 'Debe quedar al menos un administrador activo' })
        : json(200, page([ANA])),
    );
    renderAt('/usuarios');

    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar a Ana López' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Desactivar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('al menos un administrador activo');
  });
});

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText('Nombre completo'), 'Elena Paredes');
  await userEvent.type(screen.getByLabelText('DNI'), '45678912');
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
    target: { value: '1995-09-03' },
  });
  await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'FEMALE');
  await userEvent.type(screen.getByLabelText('Usuario'), 'eparedes');
  await userEvent.type(screen.getByLabelText('Correo'), 'elena@airova.test');
  await userEvent.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
  await userEvent.selectOptions(screen.getByLabelText('Rol'), 'WORKER');
}

describe('formulario de usuario', () => {
  it('muestra los errores de validación en español con el formulario vacío', async () => {
    renderAt('/usuarios/nuevo');
    await userEvent.click(await screen.findByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText('Ingresa el nombre completo')).toBeInTheDocument();
    expect(screen.getByText('Entre 8 y 12 letras o números')).toBeInTheDocument();
    expect(screen.getByText('Ingresa la fecha de nacimiento')).toBeInTheDocument();
    expect(screen.getByText('Selecciona el sexo')).toBeInTheDocument();
    expect(screen.getByText('Selecciona el rol')).toBeInTheDocument();
    expect(screen.getByText('Mínimo 10 caracteres')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aplica la regla de edad entre 18 y 60 años', async () => {
    renderAt('/usuarios/nuevo');
    const year = new Date().getFullYear();
    fireEvent.change(await screen.findByLabelText('Fecha de nacimiento'), {
      target: { value: `${year - 10}-01-01` },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(await screen.findByText('La edad debe estar entre 18 y 60 años')).toBeInTheDocument();
  });

  it('crea el usuario, omite los opcionales vacíos y vuelve al listado con un aviso', async () => {
    mockApi((_url, init) =>
      init.method === 'POST' ? json(201, record({ id: 'u-new' })) : json(200, page([])),
    );
    const router = renderAt('/usuarios/nuevo');
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Elena Paredes fue creado correctamente.',
    );
    expect(router.state.location.pathname).toBe('/usuarios');

    const [post] = callsTo('POST', '/users');
    expect(bodyOf(post)).toEqual({
      fullName: 'Elena Paredes',
      username: 'eparedes',
      email: 'elena@airova.test',
      password: 'clave-segura-123',
      dni: '45678912',
      birthDate: '1995-09-03',
      sex: 'FEMALE',
      role: 'WORKER',
      status: 'ACTIVE',
    });
  });

  it('muestra el conflicto que devuelve el servidor sin salir del formulario', async () => {
    mockApi(() => json(409, { message: 'El usuario ya está en uso. El DNI ya está registrado' }));
    const router = renderAt('/usuarios/nuevo');
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El usuario ya está en uso');
    expect(router.state.location.pathname).toBe('/usuarios/nuevo');
  });

  it('en edición carga los datos y no envía la contraseña si se deja en blanco', async () => {
    mockApi((_url, init) => (init.method === 'PATCH' ? json(200, ANA) : json(200, ANA)));
    renderAt('/usuarios/u-1/editar');

    const name = await screen.findByLabelText('Nombre completo');
    await waitFor(() => expect(name).toHaveValue('Ana López'));
    expect(screen.getByLabelText('DNI')).toHaveValue('10000001');
    expect(screen.getByLabelText('Fecha de nacimiento')).toHaveValue('1990-05-12');
    expect(screen.getByLabelText('Rol')).toHaveValue('DRIVER');
    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('');

    await userEvent.clear(name);
    await userEvent.type(name, 'Ana M. López');
    await userEvent.clear(screen.getByLabelText('Celular (opcional)'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(callsTo('PATCH', '/users/u-1')).toHaveLength(1));
    const body = bodyOf(callsTo('PATCH', '/users/u-1')[0]);
    expect(body).not.toHaveProperty('password');
    expect(body).toMatchObject({
      fullName: 'Ana M. López',
      phone: null,
      address: 'Av. Los Olivos 123',
    });
  });

  it('en edición solo envía la contraseña cuando se escribe una nueva', async () => {
    mockApi(() => json(200, ANA));
    renderAt('/usuarios/u-1/editar');
    await waitFor(() => expect(screen.getByLabelText('Nombre completo')).toHaveValue('Ana López'));

    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'corta');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Mínimo 10 caracteres')).toBeInTheDocument();
    expect(callsTo('PATCH', '/users/u-1')).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText('Nueva contraseña'));
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'una-clave-nueva-1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(callsTo('PATCH', '/users/u-1')).toHaveLength(1));
    expect(bodyOf(callsTo('PATCH', '/users/u-1')[0]).password).toBe('una-clave-nueva-1');
  });

  it('bloquea rol y estado al editar la propia cuenta', async () => {
    mockApi(() => json(200, ADMIN_ROW));
    renderAt('/usuarios/u-admin/editar');
    await waitFor(() =>
      expect(screen.getByLabelText('Nombre completo')).toHaveValue('Carlos Mendoza'),
    );
    expect(screen.getByLabelText('Rol')).toBeDisabled();
    expect(screen.getByLabelText('Estado')).toBeDisabled();
  });

  it('informa cuando el usuario no existe', async () => {
    mockApi(() => json(404, { message: 'Usuario no encontrado' }));
    renderAt('/usuarios/u-x/editar');
    expect(await screen.findByRole('alert')).toHaveTextContent('El usuario no existe.');
  });
});
