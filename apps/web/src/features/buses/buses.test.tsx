import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/types';
import { BusFormPage } from './bus-form-page';
import { BusesPage } from './buses-page';
import type { BusRecord } from './types';

const ME: AuthUser = {
  id: 'u-admin',
  fullName: 'Carlos Mendoza',
  username: 'admin',
  role: 'ADMIN',
};

const bus = (overrides: Partial<BusRecord> = {}): BusRecord => ({
  id: 'b-1',
  plate: 'ABC-123',
  brand: 'Mercedes-Benz',
  model: 'OF 1721',
  seats: 40,
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const ABC = bus();
const BCF = bus({
  id: 'b-2',
  plate: 'BCF-490',
  brand: 'Volvo',
  model: 'B270F',
  seats: 45,
  status: 'MAINTENANCE',
});
const OLD = bus({
  id: 'b-3',
  plate: 'OLD-001',
  brand: 'Scania',
  model: 'K310',
  seats: 50,
  status: 'RETIRED',
});

const page = (items: BusRecord[]) => ({ items, total: items.length, page: 1, pageSize: 10 });
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
      { path: '/buses', element: <BusesPage /> },
      { path: '/buses/nuevo', element: <BusFormPage /> },
      { path: '/buses/:id/editar', element: <BusFormPage /> },
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

describe('listado de buses', () => {
  it('muestra los buses con su estado y pide la primera página', async () => {
    mockApi(() => json(200, page([ABC, BCF, OLD])));
    renderAt('/buses');

    expect(await screen.findByText('ABC-123')).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('BCF-490')).toBeInTheDocument();
    expect(table.getByText('Volvo')).toBeInTheDocument();
    expect(table.getByText('Activo')).toBeInTheDocument();
    expect(table.getByText('Mantenimiento')).toBeInTheDocument();
    expect(table.getByText('Baja')).toBeInTheDocument();

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/buses');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('pageSize')).toBe('10');
  });

  it('muestra un mensaje cuando no hay resultados', async () => {
    mockApi(() => json(200, page([])));
    renderAt('/buses');
    expect(await screen.findByText(/No hay buses que coincidan/)).toBeInTheDocument();
  });

  it('permite reintentar cuando falla la carga', async () => {
    mockApi(() => json(500, { message: 'Error' }));
    renderAt('/buses');
    expect(await screen.findByText(/No se pudieron cargar los buses/)).toBeInTheDocument();

    mockApi(() => json(200, page([ABC])));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('ABC-123')).toBeInTheDocument();
  });

  it('busca después de dejar de escribir y filtra por estado', async () => {
    mockApi(() => json(200, page([ABC])));
    renderAt('/buses');
    await screen.findByText('ABC-123');

    await userEvent.type(screen.getByLabelText('Buscar buses'), 'abc');
    await waitFor(() => {
      const last = new URL(String(fetchMock.mock.calls.at(-1)![0]));
      expect(last.searchParams.get('search')).toBe('abc');
    });

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'MAINTENANCE');
    await waitFor(() => {
      const last = new URL(String(fetchMock.mock.calls.at(-1)![0]));
      expect(last.searchParams.get('status')).toBe('MAINTENANCE');
      expect(last.searchParams.get('search')).toBe('abc');
    });
  });

  it('da de baja un bus tras confirmar', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH' ? json(200, { ...ABC, status: 'RETIRED' }) : json(200, page([ABC])),
    );
    renderAt('/buses');

    await userEvent.click(await screen.findByRole('button', { name: 'Dar de baja bus ABC-123' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/quedará fuera de servicio/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByRole('status')).toHaveTextContent('El bus ABC-123 fue dado de baja.');
    expect(bodyOf(callsTo('PATCH', '/buses/b-1')[0])).toEqual({ status: 'RETIRED' });
  });

  it('reactiva un bus dado de baja', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH' ? json(200, { ...OLD, status: 'ACTIVE' }) : json(200, page([OLD])),
    );
    renderAt('/buses');

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar bus OLD-001' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reactivar' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent('El bus OLD-001 fue reactivado.');
    expect(bodyOf(callsTo('PATCH', '/buses/b-3')[0])).toEqual({ status: 'ACTIVE' });
  });

  it('no cambia nada si se cancela la confirmación', async () => {
    mockApi(() => json(200, page([ABC])));
    renderAt('/buses');

    await userEvent.click(await screen.findByRole('button', { name: 'Dar de baja bus ABC-123' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callsTo('PATCH', '/buses/b-1')).toHaveLength(0);
  });

  it('muestra el error del servidor si no se puede cambiar el estado', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH' ? json(500, { message: 'Fallo interno' }) : json(200, page([ABC])),
    );
    renderAt('/buses');

    await userEvent.click(await screen.findByRole('button', { name: 'Dar de baja bus ABC-123' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Dar de baja' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo interno');
  });
});

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText('Placa'), 'xyz-789');
  await userEvent.type(screen.getByLabelText('Marca'), 'Scania');
  await userEvent.type(screen.getByLabelText('Modelo'), 'K310');
  await userEvent.type(screen.getByLabelText('Asientos'), '48');
}

describe('formulario de bus', () => {
  it('muestra los errores de validación en español con el formulario vacío', async () => {
    renderAt('/buses/nuevo');
    await userEvent.click(await screen.findByRole('button', { name: 'Crear bus' }));

    expect(await screen.findByText('Entre 5 y 10 letras, números o guiones')).toBeInTheDocument();
    expect(screen.getByText('Ingresa la marca')).toBeInTheDocument();
    expect(screen.getByText('Ingresa el modelo')).toBeInTheDocument();
    expect(screen.getByText('Ingresa un número entero')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('valida el rango de asientos', async () => {
    renderAt('/buses/nuevo');
    await fillValidForm();
    const seats = screen.getByLabelText('Asientos');

    await userEvent.clear(seats);
    await userEvent.type(seats, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Crear bus' }));
    expect(await screen.findByText('Debe estar entre 10 y 80 asientos')).toBeInTheDocument();

    await userEvent.clear(seats);
    await userEvent.type(seats, '81');
    await userEvent.click(screen.getByRole('button', { name: 'Crear bus' }));
    expect(await screen.findByText('Debe estar entre 10 y 80 asientos')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('crea el bus con la placa en mayúsculas y vuelve al listado con un aviso', async () => {
    mockApi((_url, init) =>
      init.method === 'POST' ? json(201, bus({ id: 'b-new' })) : json(200, page([])),
    );
    const router = renderAt('/buses/nuevo');
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Crear bus' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'El bus XYZ-789 fue creado correctamente.',
    );
    expect(router.state.location.pathname).toBe('/buses');
    expect(bodyOf(callsTo('POST', '/buses')[0])).toEqual({
      plate: 'XYZ-789',
      brand: 'Scania',
      model: 'K310',
      seats: 48,
      status: 'ACTIVE',
    });
  });

  it('muestra el conflicto que devuelve el servidor sin perder lo escrito', async () => {
    mockApi(() => json(409, { message: 'La placa ya está registrada' }));
    const router = renderAt('/buses/nuevo');
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Crear bus' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La placa ya está registrada');
    expect(router.state.location.pathname).toBe('/buses/nuevo');
    expect(screen.getByLabelText('Placa')).toHaveValue('xyz-789');
    expect(screen.getByLabelText('Marca')).toHaveValue('Scania');
  });

  it('en edición carga los datos y guarda los cambios', async () => {
    mockApi(() => json(200, ABC));
    const router = renderAt('/buses/b-1/editar');

    const plate = await screen.findByLabelText('Placa');
    await waitFor(() => expect(plate).toHaveValue('ABC-123'));
    expect(screen.getByLabelText('Marca')).toHaveValue('Mercedes-Benz');
    expect(screen.getByLabelText('Asientos')).toHaveValue('40');
    expect(screen.getByLabelText('Estado')).toHaveValue('ACTIVE');

    const seats = screen.getByLabelText('Asientos');
    await userEvent.clear(seats);
    await userEvent.type(seats, '44');
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'MAINTENANCE' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(callsTo('PATCH', '/buses/b-1')).toHaveLength(1));
    expect(bodyOf(callsTo('PATCH', '/buses/b-1')[0])).toEqual({
      plate: 'ABC-123',
      brand: 'Mercedes-Benz',
      model: 'OF 1721',
      seats: 44,
      status: 'MAINTENANCE',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/buses'));
  });

  it('informa cuando el bus no existe', async () => {
    mockApi(() => json(404, { message: 'Bus no encontrado' }));
    renderAt('/buses/b-x/editar');
    expect(await screen.findByRole('alert')).toHaveTextContent('El bus no existe.');
  });
});
