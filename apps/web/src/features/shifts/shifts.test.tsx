import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/types';
import { ShiftDetailPage } from './shift-detail-page';
import { ShiftFormPage } from './shift-form-page';
import { ShiftsPage } from './shifts-page';
import type { ShiftDetail, ShiftRecord } from './types';

const ME: AuthUser = {
  id: 'u-admin',
  fullName: 'Carlos Mendoza',
  username: 'admin',
  role: 'ADMIN',
};

const shift = (overrides: Partial<ShiftRecord> = {}): ShiftRecord => ({
  id: 's-1',
  active: true,
  route: { id: 'r-1', origin: 'Los Olivos', destination: 'Planta Central', active: true },
  schedule: { id: 'h-1', date: '2026-11-02', departureTime: '06:30', arrivalTime: '07:30' },
  bus: { id: 'b-1', plate: 'ABC-123', seats: 3 },
  driver: { id: 'd-1', fullName: 'Mario Silva' },
  passengerCount: 2,
  ...overrides,
});

const detail = (overrides: Partial<ShiftDetail> = {}): ShiftDetail => ({
  ...shift(),
  passengers: [
    { workerId: 'w-1', fullName: 'Alfa Aguirre', dni: '10000001', attendance: 'PENDING' },
    { workerId: 'w-2', fullName: 'Beta Benites', dni: '10000002', attendance: 'PRESENT' },
  ],
  ...overrides,
});

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 10 });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ROUTES = [
  { id: 'r-1', origin: 'Los Olivos', destination: 'Planta Central' },
  { id: 'r-2', origin: 'Ate Vitarte', destination: 'Planta Central' },
];
const SCHEDULES = [
  { id: 'h-1', date: '2026-11-02', departureTime: '06:30', arrivalTime: '07:30' },
  { id: 'h-2', date: '2026-11-03', departureTime: '14:00', arrivalTime: '15:30' },
];
const BUSES = [{ id: 'b-1', plate: 'ABC-123', seats: 3 }];
const DRIVERS = [{ id: 'd-1', fullName: 'Mario Silva', dni: '20000001' }];
const WORKERS = [
  { id: 'w-1', fullName: 'Alfa Aguirre', dni: '10000001' },
  { id: 'w-2', fullName: 'Beta Benites', dni: '10000002' },
  { id: 'w-3', fullName: 'Gamma Gutiérrez', dni: '10000003' },
  { id: 'w-4', fullName: 'Delta Díaz', dni: '10000004' },
];

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

/** Responde las opciones del formulario y delega el resto en `handler`. */
function mockApi(handler: Handler = () => json(404, { message: 'no mock' })) {
  fetchMock.mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    if (init.method === undefined || init.method === 'GET') {
      if (url.pathname === '/routes') return json(200, page(ROUTES));
      if (url.pathname === '/schedules') return json(200, page(SCHEDULES));
      if (url.pathname === '/buses') return json(200, page(BUSES));
      if (url.pathname === '/users') {
        return json(200, page(url.searchParams.get('role') === 'DRIVER' ? DRIVERS : WORKERS));
      }
    }
    return handler(url, init);
  });
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
      { path: '/turnos', element: <ShiftsPage /> },
      { path: '/turnos/nuevo', element: <ShiftFormPage /> },
      { path: '/turnos/:id', element: <ShiftDetailPage /> },
      { path: '/turnos/:id/editar', element: <ShiftFormPage /> },
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

describe('listado de turnos', () => {
  it('muestra fecha, ruta, bus, conductor y ocupación, y pide la primera página', async () => {
    mockApi((url) => (url.pathname === '/shifts' ? json(200, page([shift()])) : json(404, {})));
    renderAt('/turnos');

    const table = within(await screen.findByRole('table'));
    expect(await table.findByText('Los Olivos')).toBeInTheDocument();
    expect(table.getByText('Planta Central')).toBeInTheDocument();
    expect(table.getByText('06:30 – 07:30')).toBeInTheDocument();
    expect(table.getByText('ABC-123')).toBeInTheDocument();
    expect(table.getByText('Mario Silva')).toBeInTheDocument();
    expect(table.getByText('2 / 3')).toBeInTheDocument();
    expect(table.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    expect(table.getByText('Activo')).toBeInTheDocument();

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/shifts');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('pageSize')).toBe('10');
  });

  it('muestra un mensaje cuando no hay resultados', async () => {
    mockApi(() => json(200, page([])));
    renderAt('/turnos');
    expect(await screen.findByText(/No hay turnos que coincidan/)).toBeInTheDocument();
  });

  it('filtra por estado y por rango de fechas', async () => {
    mockApi(() => json(200, page([shift()])));
    renderAt('/turnos');
    await screen.findByText('Los Olivos');

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'active');
    await waitFor(() => {
      const last = new URL(String(fetchMock.mock.calls.at(-1)![0]));
      expect(last.searchParams.get('active')).toBe('true');
    });

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-30' } });
    await waitFor(() => {
      const last = new URL(String(fetchMock.mock.calls.at(-1)![0]));
      expect(last.searchParams.get('from')).toBe('2026-11-01');
      expect(last.searchParams.get('to')).toBe('2026-11-30');
      expect(last.searchParams.get('active')).toBe('true');
    });
  });

  it('desactiva un turno tras confirmar', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH' ? json(200, shift({ active: false })) : json(200, page([shift()])),
    );
    renderAt('/turnos');

    await userEvent.click(
      await screen.findByRole('button', { name: /Desactivar turno de Los Olivos/ }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('El turno fue desactivado.');
    expect(bodyOf(callsTo('PATCH', '/shifts/s-1')[0])).toEqual({ active: false });
  });

  it('muestra el choque que devuelve el servidor al reactivar un turno', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH'
        ? json(409, { message: 'El bus ABC-123 ya tiene un turno ese día de 06:00 a 07:00' })
        : json(200, page([shift({ active: false })])),
    );
    renderAt('/turnos');

    await userEvent.click(
      await screen.findByRole('button', { name: /Activar turno de Los Olivos/ }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Activar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('ya tiene un turno ese día');
  });
});

describe('formulario de turno', () => {
  it('exige elegir ruta, horario, bus y conductor', async () => {
    mockApi();
    renderAt('/turnos/nuevo');
    await userEvent.click(await screen.findByRole('button', { name: 'Crear turno' }));

    expect(await screen.findByText('Selecciona la ruta')).toBeInTheDocument();
    expect(screen.getByText('Selecciona el horario')).toBeInTheDocument();
    expect(screen.getByText('Selecciona el bus')).toBeInTheDocument();
    expect(screen.getByText('Selecciona el conductor')).toBeInTheDocument();
    expect(callsTo('POST', '/shifts')).toHaveLength(0);
  });

  async function fillForm() {
    await screen.findByRole('option', { name: /Los Olivos → Planta Central/ });
    await userEvent.selectOptions(screen.getByLabelText('Ruta'), 'r-1');
    await userEvent.selectOptions(screen.getByLabelText('Horario'), 'h-1');
    await userEvent.selectOptions(screen.getByLabelText('Bus'), 'b-1');
    await userEvent.selectOptions(screen.getByLabelText('Conductor'), 'd-1');
  }

  it('ofrece las opciones activas con su descripción', async () => {
    mockApi();
    renderAt('/turnos/nuevo');
    expect(
      await screen.findByRole('option', { name: 'Ate Vitarte → Planta Central' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /ABC-123 · 3 asientos/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mario Silva' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /14:00–15:30/ })).toBeInTheDocument();
  });

  it('crea el turno y abre su detalle con un aviso', async () => {
    mockApi((url, init) => {
      if (init.method === 'POST') return json(201, shift({ id: 's-new' }));
      if (url.pathname === '/shifts/s-new')
        return json(200, detail({ id: 's-new', passengers: [], passengerCount: 0 }));
      return json(404, {});
    });
    const router = renderAt('/turnos/nuevo');
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Crear turno' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Turno creado. Ahora puedes asignar los pasajeros.',
    );
    expect(router.state.location.pathname).toBe('/turnos/s-new');
    expect(bodyOf(callsTo('POST', '/shifts')[0])).toEqual({
      routeId: 'r-1',
      scheduleId: 'h-1',
      busId: 'b-1',
      driverId: 'd-1',
      active: true,
    });
  });

  it('muestra el choque de horario sin salir del formulario', async () => {
    mockApi((_url, init) =>
      init.method === 'POST'
        ? json(409, {
            message: 'El conductor Mario Silva ya tiene un turno ese día de 06:00 a 07:00',
          })
        : json(404, {}),
    );
    const router = renderAt('/turnos/nuevo');
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Crear turno' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ya tiene un turno ese día');
    expect(router.state.location.pathname).toBe('/turnos/nuevo');
  });

  it('en edición carga los valores y conserva el bus actual aunque ya no figure como activo', async () => {
    const inactiveBus = { id: 'b-old', plate: 'OLD-999', seats: 20 };
    mockApi((url, init) => {
      if (init.method === 'PATCH') return json(200, shift());
      if (url.pathname === '/shifts/s-1')
        return json(200, detail({ bus: inactiveBus, passengerCount: 0, passengers: [] }));
      return json(404, {});
    });
    renderAt('/turnos/s-1/editar');

    await waitFor(() => expect(screen.getByLabelText('Ruta')).toHaveValue('r-1'));
    expect(screen.getByLabelText('Bus')).toHaveValue('b-old');
    expect(screen.getByRole('option', { name: /OLD-999 · 20 asientos/ })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Horario'), 'h-2');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(callsTo('PATCH', '/shifts/s-1')).toHaveLength(1));
    expect(bodyOf(callsTo('PATCH', '/shifts/s-1')[0])).toEqual({
      routeId: 'r-1',
      scheduleId: 'h-2',
      busId: 'b-old',
      driverId: 'd-1',
      active: true,
    });
  });

  it('informa cuando el turno no existe', async () => {
    mockApi((url) =>
      url.pathname === '/shifts/s-x'
        ? json(404, { message: 'Turno no encontrado' })
        : json(404, {}),
    );
    renderAt('/turnos/s-x/editar');
    expect(await screen.findByRole('alert')).toHaveTextContent('El turno no existe.');
  });
});

describe('detalle del turno y pasajeros', () => {
  it('muestra la ruta, la unidad, el conductor, la capacidad y el manifiesto', async () => {
    mockApi((url) => (url.pathname === '/shifts/s-1' ? json(200, detail()) : json(404, {})));
    renderAt('/turnos/s-1');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Los Olivos');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Planta Central');
    expect(screen.getByText('ABC-123')).toBeInTheDocument();
    expect(screen.getByText('Mario Silva')).toBeInTheDocument();
    expect(screen.getByText(/67 % de ocupación · 1 libre/)).toBeInTheDocument();
    expect(screen.getByText('06:30 – 07:30 (1 h)')).toBeInTheDocument();

    const table = within(screen.getByRole('table'));
    expect(table.getByText('Alfa Aguirre')).toBeInTheDocument();
    expect(table.getByText('Pendiente')).toBeInTheDocument();
    expect(table.getByText('Asistió')).toBeInTheDocument();
  });

  it('asigna pasajeros eligiendo entre los colaboradores libres', async () => {
    mockApi((url, init) => {
      if (init.method === 'POST') return json(201, detail());
      if (url.pathname === '/shifts/s-1')
        return json(200, detail({ bus: { id: 'b-1', plate: 'ABC-123', seats: 5 } }));
      return json(404, {});
    });
    renderAt('/turnos/s-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Asignar pasajeros' }));
    const panel = within(await screen.findByLabelText('Asignar pasajeros', { selector: 'div' }));

    // Alfa y Beta ya están asignados: solo se ofrecen los otros dos.
    expect(await panel.findByText('Gamma Gutiérrez')).toBeInTheDocument();
    expect(panel.getByText('Delta Díaz')).toBeInTheDocument();
    expect(panel.queryByText('Alfa Aguirre')).not.toBeInTheDocument();

    await userEvent.type(panel.getByLabelText('Buscar colaboradores'), 'gamma');
    expect(panel.queryByText('Delta Díaz')).not.toBeInTheDocument();
    await userEvent.click(panel.getByLabelText(/Gamma Gutiérrez/));
    await userEvent.click(panel.getByRole('button', { name: 'Asignar (1)' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Se asignó 1 pasajero.');
    expect(bodyOf(callsTo('POST', '/shifts/s-1/passengers')[0])).toEqual({ workerIds: ['w-3'] });
  });

  it('no deja seleccionar más colaboradores que asientos libres', async () => {
    mockApi((url) => (url.pathname === '/shifts/s-1' ? json(200, detail()) : json(404, {})));
    renderAt('/turnos/s-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Asignar pasajeros' }));
    const panel = within(await screen.findByLabelText('Asignar pasajeros', { selector: 'div' }));
    await userEvent.click(await panel.findByLabelText(/Gamma Gutiérrez/));
    await userEvent.click(panel.getByLabelText(/Delta Díaz/));

    expect(panel.getByRole('status')).toHaveTextContent('más colaboradores que asientos libres');
    expect(panel.getByRole('button', { name: 'Asignar (2)' })).toBeDisabled();
  });

  it('muestra el error del servidor (por ejemplo, un choque) dentro del panel', async () => {
    mockApi((url, init) => {
      if (init.method === 'POST')
        return json(409, {
          message: 'Gamma Gutiérrez ya está en otro turno ese día de 06:00 a 07:00',
        });
      if (url.pathname === '/shifts/s-1')
        return json(200, detail({ bus: { id: 'b-1', plate: 'ABC-123', seats: 5 } }));
      return json(404, {});
    });
    renderAt('/turnos/s-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Asignar pasajeros' }));
    const panel = within(await screen.findByLabelText('Asignar pasajeros', { selector: 'div' }));
    await userEvent.click(await panel.findByLabelText(/Gamma Gutiérrez/));
    await userEvent.click(panel.getByRole('button', { name: 'Asignar (1)' }));

    expect(await panel.findByRole('alert')).toHaveTextContent('ya está en otro turno');
  });

  it('bloquea la asignación si el bus está lleno o el turno inactivo', async () => {
    mockApi((url) =>
      url.pathname === '/shifts/s-1'
        ? json(200, detail({ passengerCount: 3, bus: { id: 'b-1', plate: 'ABC-123', seats: 3 } }))
        : json(404, {}),
    );
    renderAt('/turnos/s-1');
    expect(await screen.findByRole('button', { name: 'Asignar pasajeros' })).toBeDisabled();
    expect(screen.getByText(/El bus está lleno/)).toBeInTheDocument();
  });

  it('en un turno inactivo no permite asignar', async () => {
    mockApi((url) =>
      url.pathname === '/shifts/s-1' ? json(200, detail({ active: false })) : json(404, {}),
    );
    renderAt('/turnos/s-1');
    expect(await screen.findByRole('button', { name: 'Asignar pasajeros' })).toBeDisabled();
    expect(screen.getByText(/El turno está inactivo/)).toBeInTheDocument();
  });

  it('quita a un pasajero tras confirmar y no permite quitar a quien ya tiene asistencia', async () => {
    mockApi((url, init) => {
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.pathname === '/shifts/s-1') return json(200, detail());
      return json(404, {});
    });
    renderAt('/turnos/s-1');

    expect(await screen.findByRole('button', { name: 'Quitar a Beta Benites' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar a Alfa Aguirre' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/dejará de estar asignado/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Alfa Aguirre fue quitado del turno.',
    );
    expect(callsTo('DELETE', '/shifts/s-1/passengers/w-1')).toHaveLength(1);
  });

  it('informa cuando el turno no existe', async () => {
    mockApi((url) =>
      url.pathname === '/shifts/s-x'
        ? json(404, { message: 'Turno no encontrado' })
        : json(404, {}),
    );
    renderAt('/turnos/s-x');
    expect(await screen.findByRole('alert')).toHaveTextContent('El turno no existe.');
  });
});
