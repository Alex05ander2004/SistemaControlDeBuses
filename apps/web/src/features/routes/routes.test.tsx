import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteFormPage } from './route-form-page';
import { RoutesPage } from './routes-page';
import type { RouteRecord } from './types';

const record = (overrides: Partial<RouteRecord> = {}): RouteRecord => ({
  id: 'r-1',
  origin: 'Los Olivos',
  destination: 'Planta Central',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const NORTE = record();
const SUR = record({
  id: 'r-2',
  origin: 'Villa El Salvador',
  destination: 'Sede Almacén',
  active: false,
});

const page = (items: RouteRecord[]) => ({ items, total: items.length, page: 1, pageSize: 10 });
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
const lastQuery = () => new URL(String(fetchMock.mock.calls.at(-1)![0])).searchParams;

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/rutas', element: <RoutesPage /> },
      { path: '/rutas/nuevo', element: <RouteFormPage /> },
      { path: '/rutas/:id/editar', element: <RouteFormPage /> },
    ],
    { initialEntries: [path] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
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

describe('listado de rutas', () => {
  it('muestra las rutas con su estado y pide la primera página', async () => {
    mockApi(() => json(200, page([NORTE, SUR])));
    renderAt('/rutas');

    expect(await screen.findByText('Los Olivos')).toBeInTheDocument();
    expect(screen.getByText('Planta Central')).toBeInTheDocument();
    expect(screen.getByText('Villa El Salvador')).toBeInTheDocument();

    const table = within(screen.getByRole('table'));
    expect(table.getByText('Activa')).toBeInTheDocument();
    expect(table.getByText('Inactiva')).toBeInTheDocument();

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/routes');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('pageSize')).toBe('10');
  });

  it('muestra un mensaje cuando no hay resultados', async () => {
    mockApi(() => json(200, page([])));
    renderAt('/rutas');
    expect(await screen.findByText(/No hay rutas que coincidan/)).toBeInTheDocument();
  });

  it('permite reintentar cuando falla la carga', async () => {
    mockApi(() => json(500, { message: 'Error' }));
    renderAt('/rutas');
    expect(await screen.findByText(/No se pudieron cargar las rutas/)).toBeInTheDocument();

    mockApi(() => json(200, page([NORTE])));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Los Olivos')).toBeInTheDocument();
  });

  it('busca después de dejar de escribir y filtra por estado', async () => {
    mockApi(() => json(200, page([NORTE])));
    renderAt('/rutas');
    await screen.findByText('Los Olivos');

    await userEvent.type(screen.getByLabelText('Buscar rutas'), 'olivos');
    await waitFor(() => expect(lastQuery().get('search')).toBe('olivos'));

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'inactive');
    await waitFor(() => {
      expect(lastQuery().get('active')).toBe('false');
      expect(lastQuery().get('search')).toBe('olivos');
    });

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'active');
    await waitFor(() => expect(lastQuery().get('active')).toBe('true'));
  });

  it('desactiva una ruta tras confirmar', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH' ? json(200, { ...NORTE, active: false }) : json(200, page([NORTE])),
    );
    renderAt('/rutas');

    await userEvent.click(
      await screen.findByRole('button', { name: /Desactivar la ruta Los Olivos/ }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/dejará de poder asignarse/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'La ruta Los Olivos → Planta Central fue desactivada.',
    );
    expect(bodyOf(callsTo('PATCH', '/routes/r-1')[0])).toEqual({ active: false });
  });

  it('reactiva una ruta inactiva tras confirmar', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH' ? json(200, { ...SUR, active: true }) : json(200, page([SUR])),
    );
    renderAt('/rutas');

    await userEvent.click(await screen.findByRole('button', { name: /Activar la ruta Villa El/ }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Activar' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent('fue activada.');
    expect(bodyOf(callsTo('PATCH', '/routes/r-2')[0])).toEqual({ active: true });
  });

  it('no cambia nada si se cancela la confirmación', async () => {
    mockApi(() => json(200, page([NORTE])));
    renderAt('/rutas');

    await userEvent.click(
      await screen.findByRole('button', { name: /Desactivar la ruta Los Olivos/ }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callsTo('PATCH', '/routes/r-1')).toHaveLength(0);
  });

  it('muestra el error del servidor si no se puede cambiar el estado', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH'
        ? json(500, { message: 'Fallo inesperado' })
        : json(200, page([NORTE])),
    );
    renderAt('/rutas');

    await userEvent.click(
      await screen.findByRole('button', { name: /Desactivar la ruta Los Olivos/ }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Desactivar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo inesperado');
  });
});

describe('formulario de ruta', () => {
  it('muestra los errores de validación en español con el formulario vacío', async () => {
    renderAt('/rutas/nuevo');
    await userEvent.click(await screen.findByRole('button', { name: 'Crear ruta' }));

    expect(await screen.findByText(/Ingresa el origen/)).toBeInTheDocument();
    expect(screen.getByText(/Ingresa el destino/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza origen y destino iguales, también si solo cambian mayúsculas y espacios', async () => {
    renderAt('/rutas/nuevo');
    await userEvent.type(await screen.findByLabelText('Origen'), 'Ate Vitarte');
    await userEvent.type(screen.getByLabelText('Destino'), '  ATE   vitarte ');
    await userEvent.click(screen.getByRole('button', { name: 'Crear ruta' }));

    expect(await screen.findByText('El destino debe ser distinto del origen')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('crea la ruta con los espacios normalizados y vuelve al listado con un aviso', async () => {
    mockApi((_url, init) =>
      init.method === 'POST' ? json(201, record({ id: 'r-new' })) : json(200, page([])),
    );
    const router = renderAt('/rutas/nuevo');
    await userEvent.type(await screen.findByLabelText('Origen'), '  Los   Olivos ');
    await userEvent.type(screen.getByLabelText('Destino'), 'Planta Central');
    await userEvent.click(screen.getByRole('button', { name: 'Crear ruta' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'La ruta Los Olivos → Planta Central fue creada.',
    );
    expect(router.state.location.pathname).toBe('/rutas');
    expect(bodyOf(callsTo('POST', '/routes')[0])).toEqual({
      origin: 'Los Olivos',
      destination: 'Planta Central',
      active: true,
    });
  });

  it('permite crear la ruta como inactiva', async () => {
    mockApi((_url, init) =>
      init.method === 'POST' ? json(201, record({ id: 'r-new' })) : json(200, page([])),
    );
    renderAt('/rutas/nuevo');
    await userEvent.type(await screen.findByLabelText('Origen'), 'Callao');
    await userEvent.type(screen.getByLabelText('Destino'), 'Sede Almacén');
    await userEvent.click(screen.getByLabelText('Ruta activa'));
    await userEvent.click(screen.getByRole('button', { name: 'Crear ruta' }));

    await waitFor(() => expect(callsTo('POST', '/routes')).toHaveLength(1));
    expect(bodyOf(callsTo('POST', '/routes')[0]).active).toBe(false);
  });

  it('muestra el conflicto del servidor sin salir del formulario ni perder lo escrito', async () => {
    mockApi(() => json(409, { message: 'Ya existe una ruta con ese origen y destino' }));
    const router = renderAt('/rutas/nuevo');
    await userEvent.type(await screen.findByLabelText('Origen'), 'Los Olivos');
    await userEvent.type(screen.getByLabelText('Destino'), 'Planta Central');
    await userEvent.click(screen.getByRole('button', { name: 'Crear ruta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una ruta');
    expect(router.state.location.pathname).toBe('/rutas/nuevo');
    expect(screen.getByLabelText('Origen')).toHaveValue('Los Olivos');
    expect(screen.getByLabelText('Destino')).toHaveValue('Planta Central');
  });

  it('en edición carga los datos y envía los cambios', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH' ? json(200, NORTE) : json(200, init.method ? page([]) : NORTE),
    );
    renderAt('/rutas/r-1/editar');

    const origin = await screen.findByLabelText('Origen');
    await waitFor(() => expect(origin).toHaveValue('Los Olivos'));
    expect(screen.getByLabelText('Destino')).toHaveValue('Planta Central');
    expect(screen.getByLabelText('Ruta activa')).toBeChecked();

    await userEvent.clear(screen.getByLabelText('Destino'));
    await userEvent.type(screen.getByLabelText('Destino'), 'Planta Norte');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(callsTo('PATCH', '/routes/r-1')).toHaveLength(1));
    expect(bodyOf(callsTo('PATCH', '/routes/r-1')[0])).toEqual({
      origin: 'Los Olivos',
      destination: 'Planta Norte',
      active: true,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('se guardó.');
  });

  it('informa cuando la ruta no existe', async () => {
    mockApi(() => json(404, { message: 'Ruta no encontrada' }));
    renderAt('/rutas/r-x/editar');
    expect(await screen.findByRole('alert')).toHaveTextContent('La ruta no existe.');
  });
});
