import request from 'supertest';
import { todayIn } from '../src/common/dates';
import type { User } from '../src/generated/prisma/client';
import { createTestContext, TestContext } from './helpers/test-app';

jest.setTimeout(120_000);

const TZ = 'America/Lima';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

describe('Asistencia (e2e)', () => {
  let ctx: TestContext;
  let http: ReturnType<TestContext['app']['getHttpServer']>;
  let admin: User;
  let adminToken: string;
  let counter = 0;

  const today = todayIn(TZ);
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token: string) => request(http).get(path).set(auth(token));
  const mark = (shiftId: string, workerId: string, attendance: unknown, token: string) =>
    request(http)
      .patch(`/shifts/${shiftId}/passengers/${workerId}/attendance`)
      .set(auth(token))
      .send({ attendance });

  interface ShiftFixture {
    id: string;
    driver: User;
    workers: User[];
  }

  /** Crea un turno completo directamente en la base (sin pasar por las reglas de la API). */
  async function makeShift(options: {
    date?: string;
    departure?: string;
    arrival?: string;
    driver?: User;
    workers?: User[];
    active?: boolean;
  }): Promise<ShiftFixture> {
    counter += 1;
    const driver = options.driver ?? (await ctx.createUser('DRIVER'));
    const workers = options.workers ?? [
      await ctx.createUser('WORKER'),
      await ctx.createUser('WORKER'),
    ];
    const [route, bus, schedule] = [
      await ctx.prisma.route.create({
        data: { origin: `Origen ${counter}`, destination: `Destino ${counter}` },
      }),
      await ctx.prisma.bus.create({
        data: {
          plate: `ASI-${String(counter).padStart(3, '0')}`,
          brand: 'Volvo',
          model: 'B270F',
          seats: 40,
        },
      }),
      await ctx.prisma.schedule.create({
        data: {
          date: new Date(`${options.date ?? today}T00:00:00.000Z`),
          departureTime: time(options.departure ?? '06:00'),
          arrivalTime: time(options.arrival ?? '07:00'),
        },
      }),
    ];
    const shift = await ctx.prisma.shift.create({
      data: {
        routeId: route.id,
        scheduleId: schedule.id,
        busId: bus.id,
        driverId: driver.id,
        active: options.active ?? true,
        passengers: { create: workers.map((worker) => ({ workerId: worker.id })) },
      },
    });
    return { id: shift.id, driver, workers };
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
    it('exige sesión en todos los endpoints', async () => {
      const shift = await makeShift({});
      const [worker] = shift.workers;
      await request(http).get('/my/shifts').expect(401);
      await request(http).get(`/my/shifts/${shift.id}`).expect(401);
      await request(http).get('/attendance/overview').expect(401);
      await request(http)
        .patch(`/shifts/${shift.id}/passengers/${worker.id}/attendance`)
        .send({ attendance: 'PRESENT' })
        .expect(401);
    });

    it('cada rol solo entra a lo suyo', async () => {
      const shift = await makeShift({});
      const [worker] = shift.workers;
      const driverToken = await ctx.tokenFor(shift.driver.username);
      const workerToken = await ctx.tokenFor(worker.username);

      // El administrador no tiene "mis turnos".
      await get('/my/shifts', adminToken).expect(403);
      await get(`/my/shifts/${shift.id}`, adminToken).expect(403);
      // El resumen general es solo del administrador.
      await get('/attendance/overview', driverToken).expect(403);
      await get('/attendance/overview', workerToken).expect(403);
      // El colaborador no puede marcar asistencia, ni siquiera la suya.
      await mark(shift.id, worker.id, 'PRESENT', workerToken).expect(403);
    });
  });

  describe('GET /my/shifts como conductor', () => {
    it('lista solo sus turnos activos desde hoy, ordenados, con avance y canMark', async () => {
      const driver = await ctx.createUser('DRIVER');
      const [a, b] = [await ctx.createUser('WORKER'), await ctx.createUser('WORKER')];
      const later = await makeShift({
        driver,
        date: today,
        departure: '14:00',
        arrival: '15:00',
        workers: [a, b],
      });
      const sooner = await makeShift({
        driver,
        date: today,
        departure: '06:00',
        arrival: '07:00',
        workers: [a, b],
      });
      const next = await makeShift({ driver, date: tomorrow, workers: [a] });
      await makeShift({ driver, date: yesterday }); // pasado: fuera por defecto
      await makeShift({ driver, date: today, departure: '20:00', arrival: '21:00', active: false }); // inactivo
      await makeShift({ date: today }); // de otro conductor

      await mark(sooner.id, a.id, 'PRESENT', await ctx.tokenFor(driver.username)).expect(200);
      await mark(sooner.id, b.id, 'ABSENT', await ctx.tokenFor(driver.username)).expect(200);

      const res = await get('/my/shifts', await ctx.tokenFor(driver.username)).expect(200);
      expect(res.body.items.map((s: { id: string }) => s.id)).toEqual([
        sooner.id,
        later.id,
        next.id,
      ]);
      expect(res.body.total).toBe(3);

      const [first, second, third] = res.body.items;
      expect(first.summary).toEqual({ present: 1, absent: 1, pending: 0 });
      expect(first.canMark).toBe(true);
      expect(first.passengerCount).toBe(2);
      expect(second.summary).toEqual({ present: 0, absent: 0, pending: 2 });
      expect(third.canMark).toBe(false);
      expect([first.isToday, second.isToday, third.isToday]).toEqual([true, true, false]);
      expect(third.route).toMatchObject({ origin: expect.any(String) });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    });

    it('con from incluye turnos pasados y con to los acota', async () => {
      const driver = await ctx.createUser('DRIVER');
      const old = await makeShift({ driver, date: yesterday });
      const current = await makeShift({ driver, date: today });
      await makeShift({ driver, date: addDays(today, 5) });
      const token = await ctx.tokenFor(driver.username);

      const res = await get(`/my/shifts?from=${yesterday}&to=${today}`, token).expect(200);
      expect(res.body.items.map((s: { id: string }) => s.id)).toEqual([old.id, current.id]);
    });

    it('pagina y valida los parámetros', async () => {
      const driver = await ctx.createUser('DRIVER');
      for (const day of [0, 1, 2]) await makeShift({ driver, date: addDays(today, day) });
      const token = await ctx.tokenFor(driver.username);

      const page = await get('/my/shifts?page=2&pageSize=2', token).expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.total).toBe(3);

      await get('/my/shifts?from=2026-13-40', token).expect(400);
      await get('/my/shifts?from=hoy', token).expect(400);
      await get(`/my/shifts?from=${tomorrow}&to=${today}`, token).expect(400);
      await get('/my/shifts?pageSize=0', token).expect(400);
    });
  });

  describe('GET /my/shifts como colaborador', () => {
    it('lista solo los turnos donde viaja, con su propia asistencia y sin datos de otros', async () => {
      const worker = await ctx.createUser('WORKER');
      const other = await ctx.createUser('WORKER');
      const mine = await makeShift({ workers: [worker, other] });
      await makeShift({ workers: [other] }); // no viaja en este
      await makeShift({ workers: [worker], active: false }); // inactivo
      await makeShift({ workers: [worker], date: yesterday }); // pasado

      await ctx.prisma.shiftPassenger.updateMany({
        where: { shiftId: mine.id, workerId: worker.id },
        data: { attendance: 'PRESENT', markedAt: new Date() },
      });

      const res = await get('/my/shifts', await ctx.tokenFor(worker.username)).expect(200);
      expect(res.body.total).toBe(1);
      const [item] = res.body.items;
      expect(item.id).toBe(mine.id);
      expect(item.myAttendance).toBe('PRESENT');
      expect(item.isToday).toBe(true);
      expect(typeof item.markedAt).toBe('string');
      expect(item).not.toHaveProperty('summary');
      expect(item).not.toHaveProperty('passengers');
      expect(item).not.toHaveProperty('canMark');
      expect(JSON.stringify(res.body)).not.toContain(other.fullName);
    });

    it('un turno sin marcar aparece como pendiente', async () => {
      const worker = await ctx.createUser('WORKER');
      await makeShift({ workers: [worker] });
      const res = await get('/my/shifts', await ctx.tokenFor(worker.username)).expect(200);
      expect(res.body.items[0]).toMatchObject({ myAttendance: 'PENDING', markedAt: null });
    });
  });

  describe('GET /my/shifts/:id', () => {
    it('el conductor ve el manifiesto completo con el avance', async () => {
      const shift = await makeShift({});
      const token = await ctx.tokenFor(shift.driver.username);
      await mark(shift.id, shift.workers[0].id, 'PRESENT', token).expect(200);

      const res = await get(`/my/shifts/${shift.id}`, token).expect(200);
      expect(res.body.passengers).toHaveLength(2);
      expect(res.body.summary).toEqual({ present: 1, absent: 0, pending: 1 });
      expect(res.body.canMark).toBe(true);
      expect(res.body.isToday).toBe(true);
      const marked = res.body.passengers.find(
        (p: { workerId: string }) => p.workerId === shift.workers[0].id,
      );
      expect(marked).toMatchObject({ attendance: 'PRESENT', dni: shift.workers[0].dni });
      expect(typeof marked.markedAt).toBe('string');
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|email/);
    });

    it('el colaborador ve solo su asistencia, sin la lista de pasajeros', async () => {
      const shift = await makeShift({});
      const [worker, other] = shift.workers;
      const res = await get(`/my/shifts/${shift.id}`, await ctx.tokenFor(worker.username)).expect(
        200,
      );

      expect(res.body.myAttendance).toBe('PENDING');
      expect(res.body).not.toHaveProperty('passengers');
      expect(JSON.stringify(res.body)).not.toContain(other.fullName);
    });

    it('no revela turnos ajenos, inactivos ni inexistentes (404)', async () => {
      const shift = await makeShift({});
      const stranger = await ctx.createUser('DRIVER');
      const outsider = await ctx.createUser('WORKER');
      const inactive = await makeShift({ active: false });

      await get(`/my/shifts/${shift.id}`, await ctx.tokenFor(stranger.username)).expect(404);
      await get(`/my/shifts/${shift.id}`, await ctx.tokenFor(outsider.username)).expect(404);
      await get(`/my/shifts/${inactive.id}`, await ctx.tokenFor(inactive.driver.username)).expect(
        404,
      );
      await get(`/my/shifts/${MISSING_ID}`, await ctx.tokenFor(stranger.username)).expect(404);
      await get('/my/shifts/no-es-uuid', await ctx.tokenFor(stranger.username)).expect(400);
    });
  });

  describe('PATCH marcar asistencia', () => {
    it('el conductor marca asistió o faltó y queda registrado quién y cuándo', async () => {
      const shift = await makeShift({});
      const token = await ctx.tokenFor(shift.driver.username);
      const [a, b] = shift.workers;

      const present = await mark(shift.id, a.id, 'PRESENT', token).expect(200);
      expect(present.body).toMatchObject({
        workerId: a.id,
        fullName: a.fullName,
        attendance: 'PRESENT',
      });
      expect(typeof present.body.markedAt).toBe('string');
      await mark(shift.id, b.id, 'ABSENT', token).expect(200);

      const rows = await ctx.prisma.shiftPassenger.findMany({ where: { shiftId: shift.id } });
      const rowA = rows.find((row) => row.workerId === a.id)!;
      expect(rowA).toMatchObject({ attendance: 'PRESENT', markedById: shift.driver.id });
      expect(rowA.markedAt).not.toBeNull();

      const detail = await get(`/my/shifts/${shift.id}`, token).expect(200);
      expect(detail.body.summary).toEqual({ present: 1, absent: 1, pending: 0 });
    });

    it('PENDING deshace la marca y borra quién y cuándo', async () => {
      const shift = await makeShift({});
      const token = await ctx.tokenFor(shift.driver.username);
      const [a] = shift.workers;
      await mark(shift.id, a.id, 'PRESENT', token).expect(200);

      const undone = await mark(shift.id, a.id, 'PENDING', token).expect(200);
      expect(undone.body).toMatchObject({ attendance: 'PENDING', markedAt: null });
      const row = await ctx.prisma.shiftPassenger.findFirst({
        where: { shiftId: shift.id, workerId: a.id },
      });
      expect(row).toMatchObject({ attendance: 'PENDING', markedAt: null, markedById: null });
    });

    it('se puede cambiar de asistió a faltó', async () => {
      const shift = await makeShift({});
      const token = await ctx.tokenFor(shift.driver.username);
      const [a] = shift.workers;
      await mark(shift.id, a.id, 'PRESENT', token).expect(200);
      const res = await mark(shift.id, a.id, 'ABSENT', token).expect(200);
      expect(res.body.attendance).toBe('ABSENT');
    });

    it('un conductor no puede marcar en turnos de otro (404) ni a pasajeros que no están', async () => {
      const shift = await makeShift({});
      const stranger = await ctx.createUser('DRIVER');
      const outsider = await ctx.createUser('WORKER');
      const [a] = shift.workers;

      await mark(shift.id, a.id, 'PRESENT', await ctx.tokenFor(stranger.username)).expect(404);
      const ownToken = await ctx.tokenFor(shift.driver.username);
      await mark(shift.id, outsider.id, 'PRESENT', ownToken).expect(404);
      await mark(shift.id, MISSING_ID, 'PRESENT', ownToken).expect(404);
      await mark(MISSING_ID, a.id, 'PRESENT', ownToken).expect(404);
      const row = await ctx.prisma.shiftPassenger.findFirst({
        where: { shiftId: shift.id, workerId: a.id },
      });
      expect(row?.attendance).toBe('PENDING');
    });

    it('el conductor no puede marcar antes del día del turno (409), pero sí el mismo día o después', async () => {
      const future = await makeShift({ date: tomorrow });
      const past = await makeShift({ date: yesterday });
      const futureToken = await ctx.tokenFor(future.driver.username);
      const pastToken = await ctx.tokenFor(past.driver.username);

      const res = await mark(future.id, future.workers[0].id, 'PRESENT', futureToken).expect(409);
      expect(res.body.message).toMatch(new RegExp(`Todavía no.*${tomorrow}`));
      await mark(past.id, past.workers[0].id, 'PRESENT', pastToken).expect(200);
    });

    it('no se registra asistencia en un turno inactivo (409)', async () => {
      const shift = await makeShift({ active: false });
      const res = await mark(
        shift.id,
        shift.workers[0].id,
        'PRESENT',
        await ctx.tokenFor(shift.driver.username),
      );
      // El conductor no ve turnos inactivos en "mis turnos", pero el marcado distingue el motivo.
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/inactivo/);
      await mark(shift.id, shift.workers[0].id, 'PRESENT', adminToken).expect(409);
    });

    it('el administrador puede corregir también turnos de fechas futuras', async () => {
      const shift = await makeShift({ date: tomorrow });
      const res = await mark(shift.id, shift.workers[0].id, 'ABSENT', adminToken).expect(200);
      expect(res.body.attendance).toBe('ABSENT');
      const row = await ctx.prisma.shiftPassenger.findFirst({
        where: { shiftId: shift.id, workerId: shift.workers[0].id },
      });
      expect(row?.markedById).toBe(admin.id);
    });

    it('valida el cuerpo y los identificadores', async () => {
      const shift = await makeShift({});
      const token = await ctx.tokenFor(shift.driver.username);
      const [a] = shift.workers;
      await mark(shift.id, a.id, 'TAL_VEZ', token).expect(400);
      await mark(shift.id, a.id, undefined, token).expect(400);
      await request(http)
        .patch(`/shifts/${shift.id}/passengers/${a.id}/attendance`)
        .set(auth(token))
        .send({ attendance: 'PRESENT', extra: true })
        .expect(400);
      await mark('no-es-uuid', a.id, 'PRESENT', token).expect(400);
      await mark(shift.id, 'no-es-uuid', 'PRESENT', token).expect(400);
    });

    it('registra cada marca en la auditoría con quién la hizo', async () => {
      const shift = await makeShift({});
      const [a] = shift.workers;
      await mark(shift.id, a.id, 'PRESENT', await ctx.tokenFor(shift.driver.username)).expect(200);

      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'Shift', entityId: shift.id, action: 'ATTENDANCE_MARKED' },
      });
      expect(log?.userId).toBe(shift.driver.id);
      expect(log?.changes).toEqual({ workerId: a.id, attendance: 'PRESENT' });
    });

    it('una vez marcada la asistencia, el administrador ya no puede quitar al pasajero', async () => {
      const shift = await makeShift({});
      const [a] = shift.workers;
      await mark(shift.id, a.id, 'PRESENT', await ctx.tokenFor(shift.driver.username)).expect(200);
      await request(http)
        .delete(`/shifts/${shift.id}/passengers/${a.id}`)
        .set(auth(adminToken))
        .expect(409);
    });
  });

  describe('GET /attendance/overview', () => {
    it('resume los turnos activos del día por hora de salida, con sus conteos', async () => {
      const day = addDays(today, 40);
      const driver = await ctx.createUser('DRIVER');
      const [a, b, c] = [
        await ctx.createUser('WORKER'),
        await ctx.createUser('WORKER'),
        await ctx.createUser('WORKER'),
      ];
      const late = await makeShift({
        date: day,
        departure: '16:00',
        arrival: '17:00',
        workers: [a],
      });
      const early = await makeShift({
        date: day,
        departure: '05:00',
        arrival: '06:00',
        driver,
        workers: [a, b, c],
      });
      await makeShift({ date: day, active: false, departure: '10:00', arrival: '11:00' });
      await makeShift({ date: addDays(day, 1) }); // otro día

      await ctx.prisma.shiftPassenger.updateMany({
        where: { shiftId: early.id, workerId: a.id },
        data: { attendance: 'PRESENT' },
      });
      await ctx.prisma.shiftPassenger.updateMany({
        where: { shiftId: early.id, workerId: b.id },
        data: { attendance: 'ABSENT' },
      });

      const res = await get(`/attendance/overview?date=${day}`, adminToken).expect(200);
      expect(res.body.date).toBe(day);
      expect(res.body.items.map((s: { id: string }) => s.id)).toEqual([early.id, late.id]);
      expect(res.body.items[0].summary).toEqual({ present: 1, absent: 1, pending: 1 });
      expect(res.body.items[0].passengerCount).toBe(3);
      expect(res.body.items[1].summary).toEqual({ present: 0, absent: 0, pending: 1 });
    });

    it('sin fecha usa hoy y devuelve la fecha usada', async () => {
      const res = await get('/attendance/overview', adminToken).expect(200);
      expect(res.body.date).toBe(today);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('un día sin turnos devuelve la lista vacía y las fechas inválidas dan 400', async () => {
      const empty = await get('/attendance/overview?date=2099-01-01', adminToken).expect(200);
      expect(empty.body.items).toEqual([]);
      await get('/attendance/overview?date=2026-02-31', adminToken).expect(400);
      await get('/attendance/overview?date=ayer', adminToken).expect(400);
    });
  });
});
