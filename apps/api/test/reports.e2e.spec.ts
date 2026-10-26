import request from 'supertest';
import { addDays, formatDateTimeIn, todayIn } from '../src/common/dates';
import type { Attendance, User } from '../src/generated/prisma/client';
import { createTestContext, TestContext } from './helpers/test-app';

jest.setTimeout(120_000);

const TZ = 'America/Lima';
/** Marca de orden de bytes del CSV (se construye sin escribir el carácter invisible en el código). */
const BOM = String.fromCharCode(0xfeff);
const BOM_PATTERN = new RegExp(`^${BOM}`);
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

describe('Reportes (e2e)', () => {
  let ctx: TestContext;
  let http: ReturnType<TestContext['app']['getHttpServer']>;
  let admin: User;
  let adminToken: string;
  let counter = 0;

  const today = todayIn(TZ);
  const tomorrow = addDays(today, 1);

  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token = adminToken) => request(http).get(path).set(auth(token));
  const post = (body: object, token = adminToken) =>
    request(http).post('/reports').set(auth(token)).send(body);
  const patch = (id: string, body: object) =>
    request(http).patch(`/reports/${id}`).set(auth()).send(body);

  interface Marked {
    worker: User;
    attendance?: Attendance;
    markedBy?: User;
  }

  /** Crea un turno completo directamente en la base, con pasajeros y marcas de asistencia. */
  async function makeShift(options: {
    date?: string;
    departure?: string;
    arrival?: string;
    active?: boolean;
    driver?: User;
    origin?: string;
    passengers?: Marked[];
  }) {
    counter += 1;
    const driver = options.driver ?? (await ctx.createUser('DRIVER'));
    const passengers = options.passengers ?? [{ worker: await ctx.createUser('WORKER') }];
    const route = await ctx.prisma.route.create({
      data: { origin: options.origin ?? `Origen ${counter}`, destination: `Destino ${counter}` },
    });
    const bus = await ctx.prisma.bus.create({
      data: {
        plate: `REP-${String(counter).padStart(3, '0')}`,
        brand: 'Volvo',
        model: 'B270F',
        seats: 40,
      },
    });
    const schedule = await ctx.prisma.schedule.create({
      data: {
        date: new Date(`${options.date ?? today}T00:00:00.000Z`),
        departureTime: time(options.departure ?? '06:00'),
        arrivalTime: time(options.arrival ?? '07:00'),
      },
    });
    const shift = await ctx.prisma.shift.create({
      data: {
        routeId: route.id,
        scheduleId: schedule.id,
        busId: bus.id,
        driverId: driver.id,
        active: options.active ?? true,
        passengers: {
          create: passengers.map((passenger) => ({
            workerId: passenger.worker.id,
            attendance: passenger.attendance ?? 'PENDING',
            markedAt:
              passenger.attendance && passenger.attendance !== 'PENDING' ? new Date() : null,
            markedById: passenger.markedBy?.id ?? null,
          })),
        },
      },
    });
    return { id: shift.id, driver, route, bus, passengers };
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    http = ctx.app.getHttpServer();
    admin = await ctx.createUser('ADMIN');
    adminToken = await ctx.tokenFor(admin.username);
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('acceso', () => {
    it('exige sesión y rol ADMIN en todos los endpoints', async () => {
      const shift = await makeShift({});
      const report = await post({ shiftId: shift.id, notes: 'Informe de prueba' }).expect(201);
      const driverToken = await ctx.tokenFor(shift.driver.username);
      const workerToken = await ctx.tokenFor(shift.passengers[0].worker.username);

      const calls = [
        (t?: string) =>
          request(http)
            .get('/reports')
            .set(t ? auth(t) : {}),
        (t?: string) =>
          request(http)
            .get(`/reports/${report.body.id}`)
            .set(t ? auth(t) : {}),
        (t?: string) =>
          request(http)
            .post('/reports')
            .set(t ? auth(t) : {})
            .send({ shiftId: shift.id, notes: 'hola' }),
        (t?: string) =>
          request(http)
            .patch(`/reports/${report.body.id}`)
            .set(t ? auth(t) : {})
            .send({ notes: 'cambio' }),
        (t?: string) =>
          request(http)
            .delete(`/reports/${report.body.id}`)
            .set(t ? auth(t) : {}),
        (t?: string) =>
          request(http)
            .get('/reports/attendance')
            .set(t ? auth(t) : {}),
        (t?: string) =>
          request(http)
            .get('/reports/attendance.csv')
            .set(t ? auth(t) : {}),
      ];
      for (const call of calls) {
        await call().expect(401);
        await call(driverToken).expect(403);
        await call(workerToken).expect(403);
      }
    });
  });

  describe('informes por turno', () => {
    it('crea un informe con el autor y los datos del turno, recortando el texto', async () => {
      const shift = await makeShift({ date: today, departure: '06:30', arrival: '07:30' });
      const res = await post({
        shiftId: shift.id,
        notes: '   Hubo 10 minutos de retraso por tráfico.  ',
      }).expect(201);

      expect(res.body).toMatchObject({
        notes: 'Hubo 10 minutos de retraso por tráfico.',
        author: { id: admin.id, fullName: admin.fullName },
        shift: {
          id: shift.id,
          date: today,
          departureTime: '06:30',
          arrivalTime: '07:30',
          route: { origin: shift.route.origin, destination: shift.route.destination },
          bus: { plate: shift.bus.plate },
          driver: { fullName: shift.driver.fullName },
        },
      });
      expect(typeof res.body.createdAt).toBe('string');
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|email/);
    });

    it('permite varios informes por turno, también en turnos pasados e inactivos', async () => {
      const past = await makeShift({ date: addDays(today, -3) });
      const inactive = await makeShift({ active: false });
      await post({ shiftId: past.id, notes: 'Primer informe' }).expect(201);
      await post({ shiftId: past.id, notes: 'Segundo informe' }).expect(201);
      await post({ shiftId: inactive.id, notes: 'Turno cancelado por falla mecánica' }).expect(201);
    });

    it('rechaza informes de turnos futuros (409) y de turnos que no existen (400)', async () => {
      const future = await makeShift({ date: tomorrow });
      const res = await post({ shiftId: future.id, notes: 'Demasiado pronto' }).expect(409);
      expect(res.body.message).toMatch(new RegExp(`turno futuro.*|${tomorrow}`));
      await post({ shiftId: MISSING_ID, notes: 'Turno inexistente' }).expect(400);
    });

    it('valida el cuerpo: texto de 3 a 2000 caracteres, UUID y campos desconocidos', async () => {
      const shift = await makeShift({});
      await post({ shiftId: shift.id, notes: 'ab' }).expect(400);
      await post({ shiftId: shift.id, notes: '   ab   ' }).expect(400);
      await post({ shiftId: shift.id, notes: 'x'.repeat(2001) }).expect(400);
      await post({ shiftId: shift.id, notes: 'x'.repeat(2000) }).expect(201);
      await post({ shiftId: shift.id }).expect(400);
      await post({ notes: 'sin turno' }).expect(400);
      await post({ shiftId: 'no-es-uuid', notes: 'texto válido' }).expect(400);
      await post({ shiftId: shift.id, notes: 'texto válido', authorId: admin.id }).expect(400);
    });

    it('registra el alta en la auditoría', async () => {
      const shift = await makeShift({});
      const res = await post({ shiftId: shift.id, notes: 'Para auditar' }).expect(201);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'Report', entityId: res.body.id, action: 'REPORT_CREATED' },
      });
      expect(log?.userId).toBe(admin.id);
      expect(log?.changes).toEqual({ shiftId: shift.id });
    });

    it('lista con paginación, los más recientes primero, y filtra por turno, texto y fechas', async () => {
      const day = addDays(today, -200);
      const oldShift = await makeShift({ date: day });
      const newShift = await makeShift({ date: addDays(day, 5) });
      const first = await post({
        shiftId: oldShift.id,
        notes: 'Falla en el aire acondicionado',
      }).expect(201);
      const second = await post({
        shiftId: newShift.id,
        notes: 'Pasajero olvidó su mochila',
      }).expect(201);

      const all = await get(`/reports?from=${day}&to=${addDays(day, 5)}`).expect(200);
      expect(all.body.items.map((r: { id: string }) => r.id)).toEqual([
        second.body.id,
        first.body.id,
      ]);
      expect(all.body.total).toBe(2);

      const byShift = await get(`/reports?shiftId=${oldShift.id}`).expect(200);
      expect(byShift.body.items.map((r: { id: string }) => r.id)).toEqual([first.body.id]);

      const bySearch = await get('/reports?search=MOCHILA').expect(200);
      expect(bySearch.body.items.map((r: { id: string }) => r.id)).toEqual([second.body.id]);

      // Las fechas filtran por la fecha del turno, no por la de creación del informe.
      const onlyOld = await get(`/reports?from=${day}&to=${day}`).expect(200);
      expect(onlyOld.body.items.map((r: { id: string }) => r.id)).toEqual([first.body.id]);

      const paged = await get(
        `/reports?from=${day}&to=${addDays(day, 5)}&page=2&pageSize=1`,
      ).expect(200);
      expect(paged.body.items).toHaveLength(1);
      expect(paged.body.total).toBe(2);
    });

    it('valida los parámetros de la lista', async () => {
      await get('/reports?from=2026-13-40').expect(400);
      await get('/reports?from=ayer').expect(400);
      await get(`/reports?from=${tomorrow}&to=${today}`).expect(400);
      await get('/reports?shiftId=nope').expect(400);
      await get('/reports?pageSize=1000').expect(400);
    });

    it('devuelve un informe por id (200, 404, 400)', async () => {
      const shift = await makeShift({});
      const created = await post({ shiftId: shift.id, notes: 'Informe individual' }).expect(201);
      const res = await get(`/reports/${created.body.id}`).expect(200);
      expect(res.body.id).toBe(created.body.id);
      await get(`/reports/${MISSING_ID}`).expect(404);
      await get('/reports/no-es-uuid').expect(400);
    });

    it('edita solo el texto y no permite cambiar el turno ni el autor', async () => {
      const shift = await makeShift({});
      const other = await makeShift({});
      const created = await post({ shiftId: shift.id, notes: 'Texto original' }).expect(201);

      const res = await patch(created.body.id, { notes: '  Texto corregido  ' }).expect(200);
      expect(res.body.notes).toBe('Texto corregido');
      expect(res.body.shift.id).toBe(shift.id);
      expect(res.body.author.id).toBe(admin.id);

      await patch(created.body.id, { shiftId: other.id }).expect(400);
      await patch(created.body.id, { notes: 'ab' }).expect(400);
      await patch(created.body.id, {}).expect(400);
      await patch(MISSING_ID, { notes: 'No existe' }).expect(404);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entityId: created.body.id, action: 'REPORT_UPDATED' },
      });
      expect(log).not.toBeNull();
    });

    it('elimina un informe (204) y deja constancia', async () => {
      const shift = await makeShift({});
      const created = await post({ shiftId: shift.id, notes: 'Informe a borrar' }).expect(201);

      await request(http).delete(`/reports/${created.body.id}`).set(auth()).expect(204);
      await get(`/reports/${created.body.id}`).expect(404);
      await request(http).delete(`/reports/${created.body.id}`).set(auth()).expect(404);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entityId: created.body.id, action: 'REPORT_DELETED' },
      });
      expect(log?.changes).toEqual({ shiftId: shift.id });
    });

    it('al borrar un turno se borran sus informes (cascada)', async () => {
      const shift = await makeShift({});
      const created = await post({ shiftId: shift.id, notes: 'Se irá con el turno' }).expect(201);
      await ctx.prisma.shiftPassenger.deleteMany({ where: { shiftId: shift.id } });
      await ctx.prisma.shift.delete({ where: { id: shift.id } });
      await get(`/reports/${created.body.id}`).expect(404);
    });
  });

  describe('reporte de asistencia', () => {
    /** Escenario aislado en un rango de fechas propio, lejos del resto de los tests. */
    let scenarios = 0;
    async function scenario() {
      // Cada escenario usa su propio rango (20 días más atrás que el anterior) para no mezclar datos.
      scenarios += 1;
      const base = addDays(today, -300 - scenarios * 20);
      const [a, b, c, d, e, f] = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          ctx.createUser('WORKER', { fullName: `Colaborador ${String.fromCharCode(65 + index)}` }),
        ),
      );
      const driver = await ctx.createUser('DRIVER');
      const morning = await makeShift({
        date: base,
        departure: '06:00',
        arrival: '07:00',
        driver,
        passengers: [
          { worker: b, attendance: 'ABSENT', markedBy: driver },
          { worker: a, attendance: 'PRESENT', markedBy: driver },
          { worker: c, attendance: 'PRESENT', markedBy: driver },
        ],
      });
      const afternoon = await makeShift({
        date: base,
        departure: '14:00',
        arrival: '15:00',
        passengers: [{ worker: d, attendance: 'PRESENT', markedBy: admin }, { worker: e }],
      });
      const later = await makeShift({ date: addDays(base, 2), passengers: [{ worker: f }] });
      await makeShift({
        date: base,
        active: false,
        passengers: [{ worker: a, attendance: 'ABSENT' }],
      }); // inactivo
      await makeShift({
        date: addDays(base, -5),
        passengers: [{ worker: a, attendance: 'ABSENT' }],
      }); // fuera de rango
      return { base, driver, morning, afternoon, later, workers: { a, b, c, d, e, f } };
    }

    it('resume la asistencia del rango y calcula la tasa sobre los marcados', async () => {
      const { base } = await scenario();
      const res = await get(`/reports/attendance?from=${base}&to=${addDays(base, 2)}`).expect(200);

      expect(res.body.from).toBe(base);
      expect(res.body.to).toBe(addDays(base, 2));
      // 6 pasajeros activos: 3 asistieron, 1 faltó, 2 pendientes; tasa = 3 / (3 + 1) = 75 %.
      expect(res.body.summary).toEqual({
        total: 6,
        present: 3,
        absent: 1,
        pending: 2,
        attendanceRate: 75,
      });
      expect(res.body.total).toBe(6);
    });

    it('ordena por fecha descendente, hora de salida y nombre, y devuelve los datos de cada fila', async () => {
      const { base, driver, morning } = await scenario();
      const res = await get(`/reports/attendance?from=${base}&to=${addDays(base, 2)}`).expect(200);

      const names = res.body.items.map((row: { workerName: string }) => row.workerName);
      expect(names).toEqual([
        'Colaborador F', // más reciente
        'Colaborador A', // 06:00, por nombre
        'Colaborador B',
        'Colaborador C',
        'Colaborador D', // 14:00
        'Colaborador E',
      ]);

      const rowA = res.body.items[1];
      expect(rowA).toMatchObject({
        shiftId: morning.id,
        date: base,
        departureTime: '06:00',
        arrivalTime: '07:00',
        route: { origin: morning.route.origin, destination: morning.route.destination },
        busPlate: morning.bus.plate,
        driverName: driver.fullName,
        attendance: 'PRESENT',
        markedBy: driver.fullName,
      });
      expect(typeof rowA.markedAt).toBe('string');
      expect(res.body.items[0]).toMatchObject({
        attendance: 'PENDING',
        markedAt: null,
        markedBy: null,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|@airova/);
    });

    it('filtra la tabla por estado sin alterar las tarjetas del resumen', async () => {
      const { base } = await scenario();
      const res = await get(
        `/reports/attendance?from=${base}&to=${addDays(base, 2)}&attendance=ABSENT`,
      ).expect(200);

      expect(res.body.items.map((row: { workerName: string }) => row.workerName)).toEqual([
        'Colaborador B',
      ]);
      expect(res.body.total).toBe(1);
      expect(res.body.summary.total).toBe(6);
      expect(res.body.summary.present).toBe(3);
    });

    it('filtra por turno y pagina', async () => {
      const { base, morning } = await scenario();
      const range = `from=${base}&to=${addDays(base, 2)}`;

      const one = await get(`/reports/attendance?${range}&shiftId=${morning.id}`).expect(200);
      expect(one.body.total).toBe(3);
      expect(one.body.summary.total).toBe(3);

      const page = await get(`/reports/attendance?${range}&page=2&pageSize=4`).expect(200);
      expect(page.body.items).toHaveLength(2);
      expect(page.body.total).toBe(6);
    });

    it('sin marcas la tasa es null; sin turnos todo es cero', async () => {
      const day = addDays(today, -500);
      await makeShift({ date: day, passengers: [{ worker: await ctx.createUser('WORKER') }] });
      const pending = await get(`/reports/attendance?from=${day}&to=${day}`).expect(200);
      expect(pending.body.summary).toMatchObject({ total: 1, pending: 1, attendanceRate: null });

      const empty = await get(
        `/reports/attendance?from=${addDays(day, -10)}&to=${addDays(day, -9)}`,
      ).expect(200);
      expect(empty.body.summary).toEqual({
        total: 0,
        present: 0,
        absent: 0,
        pending: 0,
        attendanceRate: null,
      });
      expect(empty.body.items).toEqual([]);
    });

    it('sin fechas usa los últimos 30 días hasta hoy y devuelve el rango usado', async () => {
      const inside = await makeShift({ date: addDays(today, -10) });
      const outside = await makeShift({ date: addDays(today, -40) });
      const res = await get('/reports/attendance?pageSize=100').expect(200);

      expect(res.body.to).toBe(today);
      expect(res.body.from).toBe(addDays(today, -30));
      const shifts = new Set(res.body.items.map((row: { shiftId: string }) => row.shiftId));
      expect(shifts.has(inside.id)).toBe(true);
      expect(shifts.has(outside.id)).toBe(false);
    });

    it('con solo from o solo to completa el otro extremo', async () => {
      const onlyTo = await get(`/reports/attendance?to=${addDays(today, -100)}`).expect(200);
      expect(onlyTo.body.from).toBe(addDays(today, -130));
      const onlyFrom = await get(`/reports/attendance?from=${addDays(today, -5)}`).expect(200);
      expect(onlyFrom.body.to).toBe(today);
    });

    it('valida el rango (máximo 366 días), las fechas, el estado y la paginación', async () => {
      const to = addDays(today, -1);
      await get(`/reports/attendance?from=${addDays(to, -366)}&to=${to}`).expect(400);
      await get(`/reports/attendance?from=${addDays(to, -365)}&to=${to}`).expect(200);
      await get(`/reports/attendance?from=${tomorrow}&to=${today}`).expect(400);
      await get('/reports/attendance?from=2026-02-31&to=2026-03-01').expect(400);
      await get('/reports/attendance?from=ayer').expect(400);
      await get('/reports/attendance?attendance=TAL_VEZ').expect(400);
      await get('/reports/attendance?shiftId=nope').expect(400);
      await get('/reports/attendance?pageSize=101').expect(400);
    });
  });

  describe('exportación CSV', () => {
    const lines = (body: string) => body.replace(BOM_PATTERN, '').split('\r\n').filter(Boolean);

    it('devuelve un archivo CSV con BOM, cabecera en español y una fila por pasajero', async () => {
      const day = addDays(today, -400);
      const driver = await ctx.createUser('DRIVER', { fullName: 'Mario Silva' });
      const present = await ctx.createUser('WORKER', {
        fullName: 'Elena Paredes',
        dni: '40000001',
      });
      const absent = await ctx.createUser('WORKER', { fullName: 'Rosa Quispe', dni: '40000002' });
      const pending = await ctx.createUser('WORKER', { fullName: 'Carlos Rojas', dni: '40000003' });
      const shift = await makeShift({
        date: day,
        departure: '06:30',
        arrival: '07:30',
        driver,
        origin: 'Los Olivos',
        passengers: [
          { worker: present, attendance: 'PRESENT', markedBy: driver },
          { worker: absent, attendance: 'ABSENT', markedBy: driver },
          { worker: pending },
        ],
      });

      const res = await get(`/reports/attendance.csv?from=${day}&to=${day}`).expect(200);
      expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="asistencia_${day}_${day}.csv"`,
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text.startsWith(BOM)).toBe(true);

      const rows = lines(res.text);
      expect(rows[0]).toBe(
        'Fecha,Salida,Llegada,Ruta,Bus,Conductor,Colaborador,DNI,Asistencia,Marcado,Marcado por',
      );
      expect(rows).toHaveLength(4);

      const row = rows.find((line) => line.includes('Elena Paredes'))!;
      const route = `Los Olivos → ${shift.route.destination}`;
      expect(
        row.startsWith(
          `${day},06:30,07:30,${route},${shift.bus.plate},Mario Silva,Elena Paredes,40000001,Asistió,`,
        ),
      ).toBe(true);
      expect(row).toMatch(/,Asistió,\d{4}-\d{2}-\d{2} \d{2}:\d{2},Mario Silva$/);
      expect(rows.find((line) => line.includes('Rosa Quispe'))).toContain(',Faltó,');
      // Sin marcar: estado "Pendiente" y las dos últimas columnas vacías.
      expect(rows.find((line) => line.includes('Carlos Rojas'))!.endsWith(',Pendiente,,')).toBe(
        true,
      );
    });

    it('la hora de marcado se muestra en la zona horaria de la app', async () => {
      const day = addDays(today, -410);
      const worker = await ctx.createUser('WORKER');
      const markedAt = new Date('2026-03-10T15:45:00.000Z');
      const shift = await makeShift({ date: day, passengers: [{ worker }] });
      await ctx.prisma.shiftPassenger.updateMany({
        where: { shiftId: shift.id },
        data: { attendance: 'PRESENT', markedAt },
      });

      const res = await get(`/reports/attendance.csv?from=${day}&to=${day}`).expect(200);
      const row = lines(res.text)[1];
      expect(row).toContain(formatDateTimeIn(TZ, markedAt));
      expect(formatDateTimeIn(TZ, markedAt)).toBe('2026-03-10 10:45');
    });

    it('neutraliza la inyección de fórmulas y entrecomilla lo que lleva comas', async () => {
      const day = addDays(today, -420);
      const evil = await ctx.createUser('WORKER', {
        fullName: '=HYPERLINK("http://malo.example","clic")',
      });
      await makeShift({
        date: day,
        origin: 'Av. Los Olivos, cuadra 5',
        passengers: [{ worker: evil }],
      });

      const res = await get(`/reports/attendance.csv?from=${day}&to=${day}`).expect(200);
      const row = lines(res.text)[1];
      expect(row).toContain(`"'=HYPERLINK(""http://malo.example"",""clic"")"`);
      expect(row).not.toMatch(/,=HYPERLINK/);
      expect(row).toContain('"Av. Los Olivos, cuadra 5 → ');
    });

    it('aplica los mismos filtros que el reporte y excluye turnos inactivos', async () => {
      const day = addDays(today, -430);
      const [a, b] = [
        await ctx.createUser('WORKER', { fullName: 'Filtro A' }),
        await ctx.createUser('WORKER', { fullName: 'Filtro B' }),
      ];
      await makeShift({
        date: day,
        passengers: [
          { worker: a, attendance: 'PRESENT', markedBy: admin },
          { worker: b, attendance: 'ABSENT', markedBy: admin },
        ],
      });
      await makeShift({
        date: day,
        active: false,
        passengers: [{ worker: a, attendance: 'ABSENT' }],
      });

      const onlyAbsent = await get(
        `/reports/attendance.csv?from=${day}&to=${day}&attendance=ABSENT`,
      ).expect(200);
      const rows = lines(onlyAbsent.text);
      expect(rows).toHaveLength(2);
      expect(rows[1]).toContain('Filtro B');

      const all = await get(`/reports/attendance.csv?from=${day}&to=${day}`).expect(200);
      expect(lines(all.text)).toHaveLength(3);
    });

    it('un rango sin datos devuelve solo la cabecera', async () => {
      const day = addDays(today, -600);
      const res = await get(`/reports/attendance.csv?from=${day}&to=${day}`).expect(200);
      expect(lines(res.text)).toHaveLength(1);
    });

    it('sin fechas exporta los últimos 30 días y lo refleja en el nombre del archivo', async () => {
      const res = await get('/reports/attendance.csv').expect(200);
      expect(res.headers['content-disposition']).toContain(
        `asistencia_${addDays(today, -30)}_${today}.csv`,
      );
    });

    it('valida el rango igual que el reporte', async () => {
      await get(`/reports/attendance.csv?from=${tomorrow}&to=${today}`).expect(400);
      await get(`/reports/attendance.csv?from=${addDays(today, -400)}&to=${today}`).expect(400);
      await get('/reports/attendance.csv?attendance=NADA').expect(400);
    });

    it('expone Content-Disposition por CORS para que el navegador pueda leer el nombre del archivo', async () => {
      const res = await request(http)
        .get('/reports/attendance.csv')
        .set(auth())
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      expect(res.headers['access-control-expose-headers']).toMatch(/Content-Disposition/i);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });
});
