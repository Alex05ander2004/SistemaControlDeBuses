import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMarkedAt } from '@/features/attendance/types';
import { formatScheduleDate } from '@/features/schedules/types';
import type { ShiftDetail, ShiftRecord } from '@/features/shifts/types';
import { ReportFormPage } from './report-form-page';
import { ReportsPage } from './reports-page';
import type { AttendanceReport, AttendanceRow, ReportRecord } from './types';

const MARKED_AT = '2026-10-20T11:12:00.000Z';

const row = (overrides: Partial<AttendanceRow> = {}): AttendanceRow => ({
  shiftId: 's-1',
  date: '2026-10-20',
  departureTime: '06:30',
  arrivalTime: '07:30',
  route: { origin: 'Los Olivos', destination: 'Planta Central' },
  busPlate: 'ABC-123',
  driverName: 'Mario Silva',
  workerId: 'w-1',
  workerName: 'Ana López',
  workerDni: '10000001',
  attendance: 'PRESENT',
  markedAt: MARKED_AT,
  markedBy: 'Mario Silva',
  ...overrides,
});

const attendanceReport = (overrides: Partial<AttendanceReport> = {}): AttendanceReport => ({
  from: '2026-09-25',
  to: '2026-10-25',
  summary: { total: 4, present: 2, absent: 1, pending: 1, attendanceRate: 66.7 },
  items: [
    row(),
    row({ workerId: 'w-2', workerName: 'Beto Ruiz', workerDni: '10000002', attendance: 'ABSENT' }),
    row({
      workerId: 'w-3',
      workerName: 'Carla Díaz',
      workerDni: '10000003',
      attendance: 'PENDING',
      markedAt: null,
      markedBy: null,
    }),
  ],
  total: 3,
  page: 1,
  pageSize: 20,
  ...overrides,
});

const report = (overrides: Partial<ReportRecord> = {}): ReportRecord => ({
  id: 'rp-1',
  notes: 'El bus salió con 10 minutos de retraso por tráfico en la Panamericana.',
  createdAt: '2026-10-21T15:00:00.000Z',
  updatedAt: '2026-10-21T15:00:00.000Z',
  author: { id: 'u-admin', fullName: 'Carlos Mendoza' },
  shift: {
    id: 's-1',
    date: '2026-10-20',
    departureTime: '06:30',
    arrivalTime: '07:30',
    route: { origin: 'Los Olivos', destination: 'Planta Central' },
    bus: { plate: 'ABC-123' },
    driver: { fullName: 'Mario Silva' },
  },
  ...overrides,
});

const shift = (overrides: Partial<ShiftRecord> = {}): ShiftRecord => ({
  id: 's-1',
  active: true,
  route: { id: 'r-1', origin: 'Los Olivos', destination: 'Planta Central', active: true },
  schedule: { id: 'h-1', date: '2026-10-20', departureTime: '06:30', arrivalTime: '07:30' },
  bus: { id: 'b-1', plate: 'ABC-123', seats: 40 },
  driver: { id: 'd-1', fullName: 'Mario Silva' },
  passengerCount: 3,
  ...overrides,
});

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 10 });
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
const lastQuery = (path: string) => {
  const calls = callsTo('GET', path);
  return new URL(String(calls.at(-1)![0])).searchParams;
};

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/reportes', element: <ReportsPage /> },
      { path: '/reportes/nuevo', element: <ReportFormPage /> },
      { path: '/reportes/:id/editar', element: <ReportFormPage /> },
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

const createObjectURL = vi.fn(() => 'blob:fake-url');
const revokeObjectURL = vi.fn();
let clickedDownloads: Array<{ href: string; download: string }> = [];

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
  clickedDownloads = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clickedDownloads.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  fetchMock.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const attendanceApi =
  (data: AttendanceReport = attendanceReport()): Handler =>
  (url) =>
    url.pathname === '/reports/attendance' ? json(200, data) : json(404, {});

describe('pestañas de reportes', () => {
  it('abre en Asistencia por defecto y refleja la pestaña en la URL', async () => {
    mockApi((url) => {
      if (url.pathname === '/reports/attendance') return json(200, attendanceReport());
      if (url.pathname === '/reports') return json(200, page([report()]));
      return json(404, {});
    });
    const router = renderAt('/reportes');

    const tablist = screen.getByRole('tablist', { name: 'Reportes' });
    expect(within(tablist).getByRole('tab', { name: 'Asistencia' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('Ana López')).toBeInTheDocument();

    await userEvent.click(within(tablist).getByRole('tab', { name: 'Informes por turno' }));
    expect(router.state.location.search).toBe('?tab=informes');
    expect(within(tablist).getByRole('tab', { name: 'Informes por turno' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText(/retraso por tráfico/)).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-informes');
  });

  it('respeta ?tab=informes al abrir y al volver a Asistencia parte de cero', async () => {
    mockApi((url) => {
      if (url.pathname === '/reports/attendance') return json(200, attendanceReport());
      if (url.pathname === '/reports') return json(200, page([report()]));
      return json(404, {});
    });
    const router = renderAt('/reportes?tab=informes&search=trafico');
    expect(await screen.findByText(/retraso por tráfico/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Asistencia' }));
    expect(router.state.location.search).toBe('?tab=asistencia');
    expect(await screen.findByText('Ana López')).toBeInTheDocument();
  });
});

describe('reporte de asistencia', () => {
  it('muestra tarjetas, tabla y las fechas que usó el servidor en los inputs', async () => {
    mockApi(attendanceApi());
    renderAt('/reportes');

    expect(await screen.findByText('Ana López')).toBeInTheDocument();
    // Sin ?from/?to se pide sin fechas y se muestran las del servidor.
    expect(lastQuery('/reports/attendance').has('from')).toBe(false);
    expect(lastQuery('/reports/attendance').get('pageSize')).toBe('20');
    await waitFor(() => expect(screen.getByLabelText('Desde')).toHaveValue('2026-09-25'));
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-25');

    const stats = within(screen.getByLabelText('Resumen del rango'));
    expect(stats.getByText('Total').nextSibling).toHaveTextContent('4');
    expect(stats.getByText('Asistieron').nextSibling).toHaveTextContent('2');
    expect(stats.getByText('Faltaron').nextSibling).toHaveTextContent('1');
    expect(stats.getByText('Pendientes').nextSibling).toHaveTextContent('1');
    expect(stats.getByText('Tasa de asistencia').nextSibling).toHaveTextContent('66.7 %');

    const table = within(screen.getByRole('table'));
    expect(table.getAllByText(formatScheduleDate('2026-10-20'))).toHaveLength(3);
    expect(table.getAllByText('06:30 – 07:30')).toHaveLength(3);
    expect(table.getAllByText('Los Olivos')).toHaveLength(3);
    expect(table.getAllByText('ABC-123')).toHaveLength(3);
    expect(table.getByText('10000001')).toBeInTheDocument();
    expect(table.getByText('Asistió')).toBeInTheDocument();
    expect(table.getByText('Faltó')).toBeInTheDocument();
    expect(table.getByText('Pendiente')).toBeInTheDocument();
    // Asistió y Faltó llevan hora y quién marcó; Pendiente no.
    expect(table.getAllByText(`${formatMarkedAt(MARKED_AT)} · Mario Silva`)).toHaveLength(2);
  });

  it('muestra "—" como tasa cuando todavía no hay marcas', async () => {
    mockApi(
      attendanceApi(
        attendanceReport({
          summary: { total: 2, present: 0, absent: 0, pending: 2, attendanceRate: null },
        }),
      ),
    );
    renderAt('/reportes');
    const stats = within(await screen.findByLabelText('Resumen del rango'));
    expect(stats.getByText('Tasa de asistencia').nextSibling).toHaveTextContent('—');
  });

  it('manda las fechas y el estado elegidos en la consulta', async () => {
    mockApi(attendanceApi());
    renderAt('/reportes');
    await screen.findByText('Ana López');

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-15' } });
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'ABSENT');

    await waitFor(() => {
      const query = lastQuery('/reports/attendance');
      expect(query.get('from')).toBe('2026-10-01');
      expect(query.get('to')).toBe('2026-10-15');
      expect(query.get('attendance')).toBe('ABSENT');
    });
  });

  it('abre con los filtros de la URL', async () => {
    mockApi(attendanceApi());
    renderAt('/reportes?from=2026-10-05&to=2026-10-10&estado=PENDING&page=2');
    await screen.findByText('Ana López');

    const query = lastQuery('/reports/attendance');
    expect(query.get('from')).toBe('2026-10-05');
    expect(query.get('to')).toBe('2026-10-10');
    expect(query.get('attendance')).toBe('PENDING');
    expect(query.get('page')).toBe('2');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-05');
    expect(screen.getByLabelText('Filtrar por estado')).toHaveValue('PENDING');
  });

  it('muestra vacío, y error con reintento', async () => {
    mockApi(attendanceApi(attendanceReport({ items: [], total: 0 })));
    renderAt('/reportes');
    expect(
      await screen.findByText(/No hay registros de asistencia en este rango/),
    ).toBeInTheDocument();
  });

  it('permite reintentar si falla la carga', async () => {
    mockApi(() => json(500, { message: 'Error' }));
    renderAt('/reportes');
    expect(await screen.findByText(/No se pudo cargar el reporte/)).toBeInTheDocument();

    mockApi(attendanceApi());
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana López')).toBeInTheDocument();
  });

  it('muestra el mensaje del servidor cuando el rango es inválido', async () => {
    mockApi(() => json(400, { message: 'El rango máximo es de 366 días' }));
    renderAt('/reportes?from=2020-01-01&to=2026-01-01');
    expect(await screen.findByText(/El rango máximo es de 366 días/)).toBeInTheDocument();
  });
});

describe('exportación a CSV', () => {
  const csvApi =
    (csv: Handler): Handler =>
    (url, init) =>
      url.pathname === '/reports/attendance.csv' ? csv(url, init) : attendanceApi()(url, init);

  const csvResponse = () =>
    new Response('﻿fecha,colaborador\n2026-10-20,Ana', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="asistencia_2026-10-01_2026-10-15.csv"',
      },
    });

  it('descarga el CSV con los filtros activos y libera la URL temporal', async () => {
    mockApi(csvApi(() => csvResponse()));
    renderAt('/reportes?from=2026-10-01&to=2026-10-15&estado=ABSENT');
    await screen.findByText('Ana López');

    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(clickedDownloads).toHaveLength(1));
    const query = lastQuery('/reports/attendance.csv');
    expect(query.get('from')).toBe('2026-10-01');
    expect(query.get('to')).toBe('2026-10-15');
    expect(query.get('attendance')).toBe('ABSENT');
    expect(query.has('page')).toBe(false);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedDownloads[0]).toEqual({
      href: 'blob:fake-url',
      download: 'asistencia_2026-10-01_2026-10-15.csv',
    });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('exporta las fechas que se ven en pantalla aunque sean las del servidor por defecto', async () => {
    mockApi(csvApi(() => csvResponse()));
    renderAt('/reportes');
    await screen.findByText('Ana López');
    await waitFor(() => expect(screen.getByLabelText('Desde')).toHaveValue('2026-09-25'));

    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(callsTo('GET', '/reports/attendance.csv')).toHaveLength(1));
    const query = lastQuery('/reports/attendance.csv');
    expect(query.get('from')).toBe('2026-09-25');
    expect(query.get('to')).toBe('2026-10-25');
  });

  it('deshabilita el botón mientras descarga', async () => {
    let release: (response: Response) => void = () => undefined;
    mockApi(
      csvApi(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    renderAt('/reportes');
    await screen.findByText('Ana López');

    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    const busy = await screen.findByRole('button', { name: /Exportando/ });
    expect(busy).toBeDisabled();

    release(csvResponse());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled());
    expect(clickedDownloads).toHaveLength(1);
  });

  it('muestra el error si la descarga falla y vuelve a habilitar el botón', async () => {
    mockApi(csvApi(() => json(400, { message: 'El rango máximo es de 366 días' })));
    renderAt('/reportes');
    await screen.findByText('Ana López');

    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El rango máximo es de 366 días');
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
    expect(clickedDownloads).toHaveLength(0);
  });
});

describe('lista de informes', () => {
  const listApi =
    (items: ReportRecord[] = [report()]): Handler =>
    (url) =>
      url.pathname === '/reports' ? json(200, page(items)) : json(404, {});

  it('muestra turno, extracto, autor y fecha, y pide la primera página', async () => {
    mockApi(listApi());
    renderAt('/reportes?tab=informes');

    const table = within(await screen.findByRole('table'));
    expect(await table.findByText(/retraso por tráfico/)).toBeInTheDocument();
    expect(table.getByText(formatScheduleDate('2026-10-20'))).toBeInTheDocument();
    expect(table.getByText(/06:30 – 07:30 · ABC-123/)).toBeInTheDocument();
    expect(table.getByText('Carlos Mendoza')).toBeInTheDocument();

    const query = lastQuery('/reports');
    expect(query.get('page')).toBe('1');
    expect(query.get('pageSize')).toBe('10');
    expect(screen.getByRole('link', { name: /Nuevo informe/ })).toHaveAttribute(
      'href',
      '/reportes/nuevo',
    );
    expect(screen.getByRole('link', { name: /Editar informe de Los Olivos/ })).toHaveAttribute(
      'href',
      '/reportes/rp-1/editar',
    );
  });

  it('busca en las observaciones después de dejar de escribir y filtra por fechas', async () => {
    mockApi(listApi());
    renderAt('/reportes?tab=informes');
    await screen.findByText(/retraso por tráfico/);

    await userEvent.type(screen.getByLabelText('Buscar en las observaciones'), 'tráfico');
    await waitFor(() => expect(lastQuery('/reports').get('search')).toBe('tráfico'));

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-31' } });
    await waitFor(() => {
      const query = lastQuery('/reports');
      expect(query.get('from')).toBe('2026-10-01');
      expect(query.get('to')).toBe('2026-10-31');
      expect(query.get('search')).toBe('tráfico');
    });
  });

  it('muestra un mensaje cuando no hay resultados', async () => {
    mockApi(listApi([]));
    renderAt('/reportes?tab=informes');
    expect(await screen.findByText(/No hay informes que coincidan/)).toBeInTheDocument();
  });

  it('permite reintentar si falla la carga', async () => {
    mockApi(() => json(500, { message: 'Error' }));
    renderAt('/reportes?tab=informes');
    expect(await screen.findByText(/No se pudieron cargar los informes/)).toBeInTheDocument();

    mockApi(listApi());
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/retraso por tráfico/)).toBeInTheDocument();
  });

  it('elimina un informe tras confirmar y muestra un aviso', async () => {
    mockApi((url, init) => {
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      return listApi()(url, init);
    });
    renderAt('/reportes?tab=informes');

    await userEvent.click(
      await screen.findByRole('button', { name: /Eliminar informe de Los Olivos/ }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/no se puede deshacer/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('El informe fue eliminado.');
    expect(callsTo('DELETE', '/reports/rp-1')).toHaveLength(1);
  });

  it('no elimina nada si se cancela', async () => {
    mockApi(listApi());
    renderAt('/reportes?tab=informes');

    await userEvent.click(
      await screen.findByRole('button', { name: /Eliminar informe de Los Olivos/ }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callsTo('DELETE', '/reports/rp-1')).toHaveLength(0);
  });

  it('muestra el error del servidor si no se puede eliminar', async () => {
    mockApi((url, init) =>
      init.method === 'DELETE'
        ? json(404, { message: 'Informe no encontrado' })
        : listApi()(url, init),
    );
    renderAt('/reportes?tab=informes');

    await userEvent.click(
      await screen.findByRole('button', { name: /Eliminar informe de Los Olivos/ }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe no encontrado');
  });

  it('muestra el aviso que llega al volver del formulario', async () => {
    mockApi(listApi());
    const router = createMemoryRouter([{ path: '/reportes', element: <ReportsPage /> }], {
      initialEntries: [
        {
          pathname: '/reportes',
          search: '?tab=informes',
          state: { notice: 'Informe creado correctamente.' },
        },
      ],
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Informe creado correctamente.');
  });
});

describe('formulario de informe', () => {
  const formApi =
    (extra: Handler = () => json(404, {})): Handler =>
    (url, init) => {
      if (url.pathname === '/shifts' && (init.method ?? 'GET') === 'GET') {
        return json(
          200,
          page([
            shift(),
            shift({
              id: 's-2',
              route: {
                id: 'r-2',
                origin: 'Ate Vitarte',
                destination: 'Planta Central',
                active: true,
              },
              bus: { id: 'b-2', plate: 'XYZ-987', seats: 30 },
            }),
          ]),
        );
      }
      return extra(url, init);
    };

  const detail = (overrides: Partial<ShiftDetail> = {}): ShiftDetail => ({
    ...shift(),
    passengers: [],
    ...overrides,
  });

  it('pide los turnos activos hasta hoy y los ofrece con su descripción', async () => {
    mockApi(formApi());
    renderAt('/reportes/nuevo');

    expect(
      await screen.findByRole('option', { name: /Los Olivos → Planta Central · ABC-123/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Ate Vitarte → Planta Central · XYZ-987/ }),
    ).toBeInTheDocument();
    const query = lastQuery('/shifts');
    expect(query.get('active')).toBe('true');
    expect(query.get('pageSize')).toBe('100');
    expect(query.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('exige elegir el turno y escribir al menos 3 caracteres', async () => {
    mockApi(formApi());
    renderAt('/reportes/nuevo');
    await screen.findByRole('option', { name: /ABC-123/ });

    await userEvent.click(screen.getByRole('button', { name: 'Crear informe' }));
    expect(await screen.findByText('Selecciona el turno')).toBeInTheDocument();
    expect(screen.getByText('Escribe al menos 3 caracteres')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Observaciones'), '  ab  ');
    await userEvent.click(screen.getByRole('button', { name: 'Crear informe' }));
    expect(await screen.findByText('Escribe al menos 3 caracteres')).toBeInTheDocument();
    expect(callsTo('POST', '/reports')).toHaveLength(0);
  });

  it('cuenta los caracteres y avisa del máximo', async () => {
    mockApi(formApi());
    renderAt('/reportes/nuevo');
    await screen.findByRole('option', { name: /ABC-123/ });

    expect(screen.getByText('0 / 2000')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Observaciones'), {
      target: { value: 'a'.repeat(2001) },
    });
    expect(await screen.findByText('2001 / 2000')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Turno'), 's-1');
    await userEvent.click(screen.getByRole('button', { name: 'Crear informe' }));
    expect(await screen.findByText('Máximo 2000 caracteres')).toBeInTheDocument();
    expect(callsTo('POST', '/reports')).toHaveLength(0);
  });

  it('crea el informe con el payload exacto y vuelve a la lista con un aviso', async () => {
    mockApi(
      formApi((url, init) => {
        if (init.method === 'POST') return json(201, report({ id: 'rp-new' }));
        if (url.pathname === '/reports') return json(200, page([report()]));
        return json(404, {});
      }),
    );
    const router = renderAt('/reportes/nuevo');
    await screen.findByRole('option', { name: /ABC-123/ });

    await userEvent.selectOptions(screen.getByLabelText('Turno'), 's-2');
    await userEvent.type(
      screen.getByLabelText('Observaciones'),
      '  Llegó con 5 minutos de retraso.  ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Crear informe' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Informe creado correctamente.');
    expect(router.state.location.pathname).toBe('/reportes');
    expect(router.state.location.search).toBe('?tab=informes');
    expect(bodyOf(callsTo('POST', '/reports')[0])).toEqual({
      shiftId: 's-2',
      notes: 'Llegó con 5 minutos de retraso.',
    });
  });

  it('preselecciona el turno indicado en ?shiftId=', async () => {
    mockApi(formApi());
    renderAt('/reportes/nuevo?shiftId=s-2');

    await waitFor(() => expect(screen.getByLabelText('Turno')).toHaveValue('s-2'));
  });

  it('si el turno preseleccionado no está en la lista, lo pide aparte y lo agrega', async () => {
    mockApi(
      formApi((url) =>
        url.pathname === '/shifts/s-9'
          ? json(200, detail({ id: 's-9', bus: { id: 'b-9', plate: 'OLD-999', seats: 20 } }))
          : json(404, {}),
      ),
    );
    renderAt('/reportes/nuevo?shiftId=s-9');

    expect(await screen.findByRole('option', { name: /OLD-999/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Turno')).toHaveValue('s-9'));
  });

  it('muestra el 409 de turno futuro sin perder lo escrito', async () => {
    mockApi(
      formApi((_url, init) =>
        init.method === 'POST'
          ? json(409, { message: 'No se puede crear un informe de un turno futuro' })
          : json(404, {}),
      ),
    );
    const router = renderAt('/reportes/nuevo');
    await screen.findByRole('option', { name: /ABC-123/ });
    await userEvent.selectOptions(screen.getByLabelText('Turno'), 's-1');
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Texto que no debe perderse');
    await userEvent.click(screen.getByRole('button', { name: 'Crear informe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('turno futuro');
    expect(router.state.location.pathname).toBe('/reportes/nuevo');
    expect(screen.getByLabelText('Observaciones')).toHaveValue('Texto que no debe perderse');
  });

  it('muestra el 400 si el turno ya no existe', async () => {
    mockApi(
      formApi((_url, init) =>
        init.method === 'POST'
          ? json(400, { message: 'El turno indicado no existe' })
          : json(404, {}),
      ),
    );
    renderAt('/reportes/nuevo');
    await screen.findByRole('option', { name: /ABC-123/ });
    await userEvent.selectOptions(screen.getByLabelText('Turno'), 's-1');
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Observación válida');
    await userEvent.click(screen.getByRole('button', { name: 'Crear informe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El turno indicado no existe');
  });

  it('en edición carga el texto, muestra el turno de solo lectura y envía solo las observaciones', async () => {
    mockApi((url, init) => {
      if (init.method === 'PATCH') return json(200, report());
      if (url.pathname === '/reports/rp-1') return json(200, report());
      if (url.pathname === '/reports') return json(200, page([report()]));
      return json(404, {});
    });
    const router = renderAt('/reportes/rp-1/editar');

    const notes = await screen.findByLabelText('Observaciones');
    await waitFor(() => expect(notes).toHaveValue(report().notes));
    // El turno no se puede cambiar: no hay selector, solo su resumen.
    expect(screen.queryByLabelText('Turno')).not.toBeInTheDocument();
    expect(screen.getByText(/ABC-123 · Mario Silva/)).toBeInTheDocument();
    expect(callsTo('GET', '/shifts')).toHaveLength(1);

    await userEvent.clear(notes);
    await userEvent.type(notes, 'Texto corregido');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Los cambios del informe se guardaron.',
    );
    expect(router.state.location.search).toBe('?tab=informes');
    expect(bodyOf(callsTo('PATCH', '/reports/rp-1')[0])).toEqual({ notes: 'Texto corregido' });
  });

  it('informa cuando el informe no existe', async () => {
    mockApi((url) =>
      url.pathname === '/reports/rp-x'
        ? json(404, { message: 'Informe no encontrado' })
        : json(404, {}),
    );
    renderAt('/reportes/rp-x/editar');
    expect(await screen.findByRole('alert')).toHaveTextContent('El informe no existe.');
  });
});
