import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatScheduleDate } from '@/features/schedules/types';
import type { PassengerRecord } from '@/features/shifts/types';
import { AttendanceOverviewPage } from './attendance-overview-page';
import { DriverShiftPage } from './driver-shift-page';
import { DriverShiftsPage } from './driver-shifts-page';
import { formatMarkedAt, todayLocal } from './types';
import type { DriverShiftDetail, MyShift, OverviewShift } from './types';
import { WorkerShiftsPage } from './worker-shifts-page';

const TODAY = todayLocal();
const FUTURE = '2099-01-01';
const MARKED_AT = '2026-11-02T11:12:00.000Z';

const myShift = (overrides: Partial<MyShift> = {}): MyShift => ({
  id: 's-1',
  active: true,
  route: { id: 'r-1', origin: 'Los Olivos', destination: 'Planta Central', active: true },
  schedule: { id: 'h-1', date: TODAY, departureTime: '06:30', arrivalTime: '07:30' },
  bus: { id: 'b-1', plate: 'ABC-123', seats: 40 },
  driver: { id: 'd-1', fullName: 'Mario Silva' },
  passengerCount: 4,
  summary: { present: 1, absent: 1, pending: 2 },
  canMark: true,
  ...overrides,
});

const passengers = (): PassengerRecord[] => [
  {
    workerId: 'w-1',
    fullName: 'Ana López',
    dni: '10000001',
    attendance: 'PENDING',
    markedAt: null,
  },
  {
    workerId: 'w-2',
    fullName: 'Beto Ruiz',
    dni: '10000002',
    attendance: 'PRESENT',
    markedAt: MARKED_AT,
  },
  {
    workerId: 'w-3',
    fullName: 'Carla Díaz',
    dni: '10000003',
    attendance: 'ABSENT',
    markedAt: MARKED_AT,
  },
  { workerId: 'w-4', fullName: 'Dino Paz', dni: '10000004', attendance: 'PENDING', markedAt: null },
];

const driverDetail = (overrides: Partial<DriverShiftDetail> = {}): DriverShiftDetail => ({
  ...myShift(),
  summary: { present: 1, absent: 1, pending: 2 },
  canMark: true,
  passengers: passengers(),
  ...overrides,
});

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 50 });
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
const lastUrl = () => new URL(String(fetchMock.mock.calls.at(-1)![0]));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/conductor', element: <DriverShiftsPage /> },
      { path: '/conductor/turnos/:id', element: <DriverShiftPage /> },
      { path: '/colaborador', element: <WorkerShiftsPage /> },
      { path: '/asistencia', element: <AttendanceOverviewPage /> },
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

describe('conductor: mis turnos', () => {
  it('muestra el turno con su avance de marcado y la insignia "Hoy"', async () => {
    mockApi(() => json(200, page([myShift()])));
    renderAt('/conductor');

    expect(await screen.findByText('Los Olivos')).toBeInTheDocument();
    expect(screen.getByText('Planta Central')).toBeInTheDocument();
    expect(screen.getByText('06:30 – 07:30')).toBeInTheDocument();
    expect(screen.getByText(/ABC-123 · 4 \/ 40 pasajeros/)).toBeInTheDocument();
    expect(screen.getByText('Hoy')).toBeInTheDocument();
    expect(screen.getByText('2 de 4 marcados')).toBeInTheDocument();

    const progress = screen.getByRole('progressbar', { name: 'Asistencia marcada' });
    expect(progress).toHaveAttribute('aria-valuenow', '2');
    expect(progress).toHaveAttribute('aria-valuemax', '4');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/conductor/turnos/s-1');

    const url = lastUrl();
    expect(url.pathname).toBe('/my/shifts');
    expect(url.searchParams.get('pageSize')).toBe('50');
    // Sin `from`: el servidor decide qué es "hoy".
    expect(url.searchParams.has('from')).toBe(false);
  });

  it('un turno futuro no lleva "Hoy" y avisa que se marca el día del turno', async () => {
    mockApi(() =>
      json(
        200,
        page([
          myShift({
            schedule: { id: 'h-2', date: FUTURE, departureTime: '14:00', arrivalTime: '15:00' },
            canMark: false,
            summary: { present: 0, absent: 0, pending: 4 },
          }),
        ]),
      ),
    );
    renderAt('/conductor');

    expect(await screen.findByText('14:00 – 15:00')).toBeInTheDocument();
    expect(screen.queryByText('Hoy')).not.toBeInTheDocument();
    expect(screen.getByText('0 de 4 marcados')).toBeInTheDocument();
    expect(screen.getByText(/Podrás marcar la asistencia el día del turno/)).toBeInTheDocument();
  });

  it('muestra un mensaje cuando no hay turnos', async () => {
    mockApi(() => json(200, page([])));
    renderAt('/conductor');
    expect(await screen.findByText('No tienes turnos programados.')).toBeInTheDocument();
  });

  it('permite reintentar cuando falla la carga', async () => {
    mockApi(() => json(500, { message: 'Error' }));
    renderAt('/conductor');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar tus turnos');

    mockApi(() => json(200, page([myShift()])));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Los Olivos')).toBeInTheDocument();
  });
});

describe('conductor: marcar asistencia', () => {
  /** Servidor simulado con estado: aplica los PATCH y responde el detalle actualizado. */
  function statefulServer(options: { canMark?: boolean; failPatch?: Response } = {}) {
    const state = passengers();
    mockApi((url, init) => {
      if (init.method === 'PATCH') {
        if (options.failPatch) return options.failPatch.clone();
        const workerId = url.pathname.split('/')[4];
        const { attendance } = JSON.parse(String(init.body));
        const target = state.find((p) => p.workerId === workerId)!;
        target.attendance = attendance;
        target.markedAt = attendance === 'PENDING' ? null : MARKED_AT;
        return json(200, { ...target });
      }
      if (url.pathname === '/my/shifts/s-1') {
        return json(
          200,
          driverDetail({
            canMark: options.canMark ?? true,
            passengers: state.map((p) => ({ ...p })),
          }),
        );
      }
      return json(404, { message: 'no mock' });
    });
    return state;
  }

  const counter = (label: string) => screen.getByText(label).previousElementSibling;

  it('muestra los conteos, las pestañas con totales y las tarjetas de pasajeros', async () => {
    statefulServer();
    renderAt('/conductor/turnos/s-1');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Los Olivos');
    expect(counter('Asistieron')).toHaveTextContent('1');
    expect(counter('Faltaron')).toHaveTextContent('1');
    expect(counter('Pendientes')).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: 'Todos (4)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Pendientes (2)' })).toBeInTheDocument();
    expect(screen.getByText('Ana López')).toBeInTheDocument();
    expect(screen.getByText('DNI 10000001')).toBeInTheDocument();
    // Beto y Carla ya estaban marcados: ambos muestran la hora.
    expect(screen.getAllByText(`Marcado a las ${formatMarkedAt(MARKED_AT)}`)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Asistió: Beto Ruiz' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Faltó: Beto Ruiz' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('filtra por estado y busca por nombre o DNI', async () => {
    statefulServer();
    renderAt('/conductor/turnos/s-1');
    await screen.findByText('Ana López');

    await userEvent.click(screen.getByRole('tab', { name: 'Pendientes (2)' }));
    expect(screen.getByText('Ana López')).toBeInTheDocument();
    expect(screen.getByText('Dino Paz')).toBeInTheDocument();
    expect(screen.queryByText('Beto Ruiz')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Faltaron (1)' }));
    expect(screen.getByText('Carla Díaz')).toBeInTheDocument();
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Todos (4)' }));
    await userEvent.type(screen.getByLabelText('Buscar pasajeros'), '10000002');
    expect(screen.getByText('Beto Ruiz')).toBeInTheDocument();
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Buscar pasajeros'));
    await userEvent.type(screen.getByLabelText('Buscar pasajeros'), 'zzz');
    expect(screen.getByText('Ningún pasajero coincide con el filtro.')).toBeInTheDocument();
  });

  it('marca "Asistió" con el PATCH exacto y actualiza conteos y botón al instante', async () => {
    statefulServer();
    renderAt('/conductor/turnos/s-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Asistió: Ana López' }));

    await waitFor(() =>
      expect(callsTo('PATCH', '/shifts/s-1/passengers/w-1/attendance')).toHaveLength(1),
    );
    expect(bodyOf(callsTo('PATCH', '/shifts/s-1/passengers/w-1/attendance')[0])).toEqual({
      attendance: 'PRESENT',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Asistió: Ana López' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(counter('Asistieron')).toHaveTextContent('2');
    expect(counter('Pendientes')).toHaveTextContent('1');
    expect(screen.getByRole('progressbar', { name: 'Asistencia marcada' })).toHaveAttribute(
      'aria-valuenow',
      '3',
    );
  });

  it('marca "Faltó" con el PATCH exacto', async () => {
    statefulServer();
    renderAt('/conductor/turnos/s-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Faltó: Dino Paz' }));

    await waitFor(() =>
      expect(callsTo('PATCH', '/shifts/s-1/passengers/w-4/attendance')).toHaveLength(1),
    );
    expect(bodyOf(callsTo('PATCH', '/shifts/s-1/passengers/w-4/attendance')[0])).toEqual({
      attendance: 'ABSENT',
    });
    await waitFor(() => expect(counter('Faltaron')).toHaveTextContent('2'));
  });

  it('volver a pulsar el estado actual lo deshace (PENDING)', async () => {
    statefulServer();
    renderAt('/conductor/turnos/s-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Asistió: Beto Ruiz' }));

    await waitFor(() =>
      expect(callsTo('PATCH', '/shifts/s-1/passengers/w-2/attendance')).toHaveLength(1),
    );
    expect(bodyOf(callsTo('PATCH', '/shifts/s-1/passengers/w-2/attendance')[0])).toEqual({
      attendance: 'PENDING',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Asistió: Beto Ruiz' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
    expect(counter('Asistieron')).toHaveTextContent('0');
  });

  it('si todavía no es la fecha del turno deshabilita los botones y lo avisa', async () => {
    statefulServer({ canMark: false });
    renderAt('/conductor/turnos/s-1');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Podrás marcar la asistencia el día del turno.',
    );
    expect(screen.getByRole('button', { name: 'Asistió: Ana López' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Faltó: Ana López' })).toBeDisabled();
    expect(callsTo('PATCH', '/shifts/s-1/passengers/w-1/attendance')).toHaveLength(0);
  });

  it('si el servidor rechaza el cambio, muestra el error y revierte el estado', async () => {
    statefulServer({ failPatch: json(409, { message: 'El turno está inactivo' }) });
    renderAt('/conductor/turnos/s-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Asistió: Ana López' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El turno está inactivo');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Asistió: Ana López' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
    // La lista sigue entera y operativa.
    expect(screen.getByText('Dino Paz')).toBeInTheDocument();
    expect(counter('Asistieron')).toHaveTextContent('1');
  });

  it('informa cuando el turno no existe o no es del conductor', async () => {
    mockApi(() => json(404, { message: 'Turno no encontrado' }));
    renderAt('/conductor/turnos/s-x');
    expect(await screen.findByRole('alert')).toHaveTextContent('El turno no existe o no es tuyo.');
  });

  it('avisa cuando el turno no tiene pasajeros', async () => {
    mockApi(() =>
      json(
        200,
        driverDetail({
          passengers: [],
          passengerCount: 0,
          summary: { present: 0, absent: 0, pending: 0 },
        }),
      ),
    );
    renderAt('/conductor/turnos/s-1');
    expect(
      await screen.findByText('Este turno aún no tiene pasajeros asignados.'),
    ).toBeInTheDocument();
  });
});

describe('colaborador: mis turnos', () => {
  it('muestra cada turno con su estado de asistencia y la hora de marcado', async () => {
    mockApi(() =>
      json(
        200,
        page([
          myShift({
            id: 's-1',
            summary: undefined,
            canMark: undefined,
            myAttendance: 'PRESENT',
            markedAt: MARKED_AT,
          }),
          myShift({
            id: 's-2',
            schedule: { id: 'h-2', date: FUTURE, departureTime: '14:00', arrivalTime: '15:00' },
            bus: { id: 'b-2', plate: 'XYZ-987', seats: 30 },
            driver: { id: 'd-2', fullName: 'Rosa Quispe' },
            summary: undefined,
            canMark: undefined,
            myAttendance: 'PENDING',
            markedAt: null,
          }),
        ]),
      ),
    );
    renderAt('/colaborador');

    expect(await screen.findByText('06:30 – 07:30')).toBeInTheDocument();
    expect(screen.getByText('14:00 – 15:00')).toBeInTheDocument();
    expect(screen.getByText('Asistió')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Hoy')).toBeInTheDocument();
    expect(screen.getByText('ABC-123')).toBeInTheDocument();
    expect(screen.getByText('XYZ-987')).toBeInTheDocument();
    expect(screen.getByText('Mario Silva')).toBeInTheDocument();
    expect(screen.getByText('Rosa Quispe')).toBeInTheDocument();
    expect(screen.getByText(`Marcado a las ${formatMarkedAt(MARKED_AT)}`)).toBeInTheDocument();
    expect(screen.getAllByText(/Marcado a las/)).toHaveLength(1);
  });

  it('muestra "Faltó" cuando el conductor lo marcó ausente', async () => {
    mockApi(() =>
      json(
        200,
        page([
          myShift({
            summary: undefined,
            canMark: undefined,
            myAttendance: 'ABSENT',
            markedAt: MARKED_AT,
          }),
        ]),
      ),
    );
    renderAt('/colaborador');
    expect(await screen.findByText('Faltó')).toBeInTheDocument();
  });

  it('muestra un mensaje cuando no hay turnos asignados', async () => {
    mockApi(() => json(200, page([])));
    renderAt('/colaborador');
    expect(await screen.findByText('No tienes turnos asignados.')).toBeInTheDocument();
  });

  it('permite reintentar cuando falla la carga', async () => {
    mockApi(() => json(500, { message: 'Error' }));
    renderAt('/colaborador');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar tus turnos');
  });
});

describe('administrador: resumen de asistencia', () => {
  const overviewItem = (overrides: Partial<OverviewShift> = {}): OverviewShift => ({
    ...myShift(),
    summary: { present: 3, absent: 1, pending: 2 },
    passengerCount: 6,
    ...overrides,
  });

  it('muestra totales y conteos por turno, pide "hoy" sin fecha y enlaza al detalle', async () => {
    mockApi(() =>
      json(200, {
        date: '2026-11-02',
        items: [
          overviewItem(),
          overviewItem({
            id: 's-2',
            schedule: {
              id: 'h-2',
              date: '2026-11-02',
              departureTime: '14:00',
              arrivalTime: '15:00',
            },
            summary: { present: 0, absent: 0, pending: 5 },
            passengerCount: 5,
          }),
        ],
      }),
    );
    renderAt('/asistencia');

    expect(await screen.findByText('06:30 – 07:30')).toBeInTheDocument();
    const url = lastUrl();
    expect(url.pathname).toBe('/attendance/overview');
    expect(url.searchParams.has('date')).toBe(false);
    // El input refleja la fecha que resolvió el servidor.
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-11-02');

    // Solo las tarjetas de totales (la cabecera de la tabla también dice "Pasajeros").
    const totals = (label: string) => screen.getByText(label, { selector: 'p' }).nextElementSibling;
    expect(totals('Pasajeros')).toHaveTextContent('11');
    expect(totals('Asistieron')).toHaveTextContent('3');
    expect(totals('Faltaron')).toHaveTextContent('1');
    expect(totals('Pendientes')).toHaveTextContent('7');

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(rows[1]).getByText('3 asistió')).toBeInTheDocument();
    expect(within(rows[1]).getByText('1 faltó')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('img')).toHaveAttribute(
      'aria-label',
      '3 asistieron, 1 faltaron, 2 pendientes',
    );
    expect(within(rows[1]).getByRole('link')).toHaveAttribute('href', '/turnos/s-1');
    expect(within(rows[2]).getByText('5 pendiente')).toBeInTheDocument();
  });

  it('usa la fecha de la URL, la cambia desde el selector y vuelve a "hoy" con el botón', async () => {
    mockApi((url) =>
      json(200, { date: url.searchParams.get('date') ?? '2026-11-02', items: [overviewItem()] }),
    );
    const router = renderAt('/asistencia?date=2026-11-05');

    await screen.findByText('06:30 – 07:30');
    expect(lastUrl().searchParams.get('date')).toBe('2026-11-05');
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-11-05');

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-09' } });
    await waitFor(() => expect(lastUrl().searchParams.get('date')).toBe('2026-11-09'));
    expect(router.state.location.search).toBe('?date=2026-11-09');

    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(lastUrl().searchParams.has('date')).toBe(false));
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeDisabled();
  });

  it('ignora una fecha inválida en la URL', async () => {
    mockApi(() => json(200, { date: '2026-11-02', items: [] }));
    renderAt('/asistencia?date=no-es-fecha');
    await screen.findByText(/No hay turnos el/);
    expect(lastUrl().searchParams.has('date')).toBe(false);
  });

  it('avisa cuando no hay turnos ese día', async () => {
    mockApi(() => json(200, { date: '2026-11-02', items: [] }));
    renderAt('/asistencia');
    expect(
      await screen.findByText(`No hay turnos el ${formatScheduleDate('2026-11-02')}.`),
    ).toBeInTheDocument();
  });

  it('permite reintentar cuando falla la carga', async () => {
    mockApi(() => json(500, { message: 'Error' }));
    renderAt('/asistencia');
    expect(await screen.findByText(/No se pudo cargar la asistencia/)).toBeInTheDocument();

    mockApi(() => json(200, { date: '2026-11-02', items: [overviewItem()] }));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('06:30 – 07:30')).toBeInTheDocument();
  });
});
