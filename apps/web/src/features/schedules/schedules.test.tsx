import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleFormPage } from './schedule-form-page';
import { SchedulesPage } from './schedules-page';
import { formatDuration, formatScheduleDate, minutesBetween, type ScheduleRecord } from './types';

const record = (overrides: Partial<ScheduleRecord> = {}): ScheduleRecord => ({
  id: 's-1',
  date: '2026-11-02',
  departureTime: '06:30',
  arrivalTime: '08:00',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const MONDAY = record();
const SHORT = record({
  id: 's-2',
  date: '2026-11-03',
  departureTime: '14:00',
  arrivalTime: '14:45',
});
const EXACT = record({
  id: 's-3',
  date: '2026-11-04',
  departureTime: '10:00',
  arrivalTime: '12:00',
});

const page = (items: ScheduleRecord[]) => ({ items, total: items.length, page: 1, pageSize: 10 });
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
const lastListUrl = () =>
  new URL(
    String(
      fetchMock.mock.calls.filter(([i]) => new URL(String(i)).pathname === '/schedules').at(-1)![0],
    ),
  );

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/horarios', element: <SchedulesPage /> },
      { path: '/horarios/nuevo', element: <ScheduleFormPage /> },
      { path: '/horarios/:id/editar', element: <ScheduleFormPage /> },
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

describe('formato de horarios', () => {
  it('formatea la fecha en español sin desplazar el día', () => {
    expect(formatScheduleDate('2026-11-02')).toMatch(/^lun\.? 2 nov\.? 2026$/i);
    expect(formatScheduleDate('2026-01-01')).toMatch(/^jue\.? 1 ene\.? 2026$/i);
  });

  it('calcula y formatea la duración', () => {
    expect(formatDuration(minutesBetween('06:30', '08:00'))).toBe('1 h 30 min');
    expect(formatDuration(minutesBetween('14:00', '14:45'))).toBe('45 min');
    expect(formatDuration(minutesBetween('10:00', '12:00'))).toBe('2 h');
    expect(formatDuration(0)).toBe('—');
  });
});

describe('listado de horarios', () => {
  it('muestra fecha, salida, llegada y duración formateadas y pide la primera página', async () => {
    mockApi(() => json(200, page([MONDAY, SHORT, EXACT])));
    renderAt('/horarios');

    const table = within(await screen.findByRole('table'));
    expect(await table.findByText(/^lun\.? 2 nov\.? 2026$/i)).toBeInTheDocument();
    expect(table.getByText('06:30')).toBeInTheDocument();
    expect(table.getByText('08:00')).toBeInTheDocument();
    expect(table.getByText('1 h 30 min')).toBeInTheDocument();
    expect(table.getByText('45 min')).toBeInTheDocument();
    expect(table.getByText('2 h')).toBeInTheDocument();

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/schedules');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('pageSize')).toBe('10');
    expect(url.searchParams.has('from')).toBe(false);
  });

  it('muestra un mensaje cuando no hay horarios', async () => {
    mockApi(() => json(200, page([])));
    renderAt('/horarios');
    expect(await screen.findByText('Aún no hay horarios registrados.')).toBeInTheDocument();
  });

  it('permite reintentar cuando falla la carga', async () => {
    mockApi(() => json(500, { message: 'Error' }));
    renderAt('/horarios');
    expect(await screen.findByText(/No se pudieron cargar los horarios/)).toBeInTheDocument();

    mockApi(() => json(200, page([MONDAY])));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('06:30')).toBeInTheDocument();
  });

  it('filtra por rango de fechas y puede limpiar los filtros', async () => {
    mockApi(() => json(200, page([MONDAY])));
    renderAt('/horarios');
    await screen.findByText('06:30');

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    await waitFor(() => expect(lastListUrl().searchParams.get('from')).toBe('2026-11-01'));

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-30' } });
    await waitFor(() => {
      expect(lastListUrl().searchParams.get('to')).toBe('2026-11-30');
      expect(lastListUrl().searchParams.get('from')).toBe('2026-11-01');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => {
      expect(lastListUrl().searchParams.has('from')).toBe(false);
      expect(lastListUrl().searchParams.has('to')).toBe(false);
    });
  });

  it('con filtros activos y sin resultados explica que no hay horarios en el rango', async () => {
    mockApi(() => json(200, page([])));
    renderAt('/horarios?from=2030-01-01');
    expect(
      await screen.findByText('No hay horarios en el rango de fechas elegido.'),
    ).toBeInTheDocument();
  });

  it('elimina un horario tras confirmar', async () => {
    mockApi((_url, init) =>
      init.method === 'DELETE' ? new Response(null, { status: 204 }) : json(200, page([MONDAY])),
    );
    renderAt('/horarios');

    await userEvent.click(await screen.findByRole('button', { name: /^Eliminar horario del/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/no se puede deshacer/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Se eliminó el horario del');
    expect(callsTo('DELETE', '/schedules/s-1')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no elimina nada si se cancela la confirmación', async () => {
    mockApi(() => json(200, page([MONDAY])));
    renderAt('/horarios');

    await userEvent.click(await screen.findByRole('button', { name: /^Eliminar horario del/ }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callsTo('DELETE', '/schedules/s-1')).toHaveLength(0);
  });

  it('muestra el error 409 del servidor cuando el horario está en uso', async () => {
    mockApi((_url, init) =>
      init.method === 'DELETE'
        ? json(409, { message: 'No se puede eliminar: el horario está asignado a 2 turnos' })
        : json(200, page([MONDAY])),
    );
    renderAt('/horarios');

    await userEvent.click(await screen.findByRole('button', { name: /^Eliminar horario del/ }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('asignado a 2 turnos');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('06:30')).toBeInTheDocument();
  });
});

function fillForm(date = '2026-11-10', departure = '07:00', arrival = '08:30') {
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: date } });
  fireEvent.change(screen.getByLabelText('Hora de salida'), { target: { value: departure } });
  fireEvent.change(screen.getByLabelText('Hora de llegada'), { target: { value: arrival } });
}

describe('formulario de horario', () => {
  it('muestra los errores de validación en español con el formulario vacío', async () => {
    renderAt('/horarios/nuevo');
    await userEvent.click(await screen.findByRole('button', { name: 'Crear horario' }));

    expect(await screen.findByText('Ingresa la fecha')).toBeInTheDocument();
    expect(screen.getByText('Ingresa la hora de salida')).toBeInTheDocument();
    expect(screen.getByText('Ingresa la hora de llegada')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exige que la llegada sea posterior a la salida', async () => {
    renderAt('/horarios/nuevo');
    await screen.findByLabelText('Fecha');
    fillForm('2026-11-10', '09:00', '09:00');
    await userEvent.click(screen.getByRole('button', { name: 'Crear horario' }));
    expect(
      await screen.findByText('La llegada debe ser posterior a la salida'),
    ).toBeInTheDocument();

    fillForm('2026-11-10', '22:00', '01:00');
    await userEvent.click(screen.getByRole('button', { name: 'Crear horario' }));
    expect(
      await screen.findByText('La llegada debe ser posterior a la salida'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('muestra la duración calculada mientras se escriben las horas', async () => {
    renderAt('/horarios/nuevo');
    await screen.findByLabelText('Fecha');
    fillForm('2026-11-10', '07:00', '08:30');
    expect(await screen.findByText('1 h 30 min')).toBeInTheDocument();
  });

  it('crea el horario con el payload exacto y vuelve al listado con un aviso', async () => {
    mockApi((_url, init) =>
      init.method === 'POST' ? json(201, record({ id: 's-new' })) : json(200, page([])),
    );
    const router = renderAt('/horarios/nuevo');
    await screen.findByLabelText('Fecha');
    fillForm('2026-11-10', '07:00', '08:30');
    await userEvent.click(screen.getByRole('button', { name: 'Crear horario' }));

    expect(await screen.findByRole('status')).toHaveTextContent('fue creado correctamente');
    expect(router.state.location.pathname).toBe('/horarios');
    expect(bodyOf(callsTo('POST', '/schedules')[0])).toEqual({
      date: '2026-11-10',
      departureTime: '07:00',
      arrivalTime: '08:30',
    });
  });

  it('muestra el conflicto 409 sin salir del formulario ni perder lo escrito', async () => {
    mockApi(() =>
      json(409, { message: 'Ya existe un horario con la misma fecha, salida y llegada' }),
    );
    const router = renderAt('/horarios/nuevo');
    await screen.findByLabelText('Fecha');
    fillForm('2026-11-10', '07:00', '08:30');
    await userEvent.click(screen.getByRole('button', { name: 'Crear horario' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un horario');
    expect(router.state.location.pathname).toBe('/horarios/nuevo');
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-11-10');
    expect(screen.getByLabelText('Hora de salida')).toHaveValue('07:00');
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('08:30');
  });

  it('en edición carga los datos del horario y guarda los cambios', async () => {
    mockApi((_url, init) =>
      init.method === 'PATCH' ? json(200, { ...MONDAY, arrivalTime: '09:00' }) : json(200, MONDAY),
    );
    const router = renderAt('/horarios/s-1/editar');

    await waitFor(() => expect(screen.getByLabelText('Fecha')).toHaveValue('2026-11-02'));
    expect(screen.getByLabelText('Hora de salida')).toHaveValue('06:30');
    expect(screen.getByLabelText('Hora de llegada')).toHaveValue('08:00');

    fireEvent.change(screen.getByLabelText('Hora de llegada'), { target: { value: '09:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(callsTo('PATCH', '/schedules/s-1')).toHaveLength(1));
    expect(bodyOf(callsTo('PATCH', '/schedules/s-1')[0])).toEqual({
      date: '2026-11-02',
      departureTime: '06:30',
      arrivalTime: '09:00',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/horarios'));
  });

  it('informa cuando el horario no existe', async () => {
    mockApi(() => json(404, { message: 'Horario no encontrado' }));
    renderAt('/horarios/s-x/editar');
    expect(await screen.findByRole('alert')).toHaveTextContent('El horario no existe.');
  });
});
