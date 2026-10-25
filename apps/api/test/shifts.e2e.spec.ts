import request from 'supertest';
import type { BusStatus } from '../src/generated/prisma/client';
import { createTestContext, TestContext } from './helpers/test-app';

jest.setTimeout(90_000);

const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Turnos (e2e)', () => {
  let ctx: TestContext;
  let http: ReturnType<TestContext['app']['getHttpServer']>;
  let adminToken: string;
  let admin: Awaited<ReturnType<TestContext['createUser']>>;
  let counter = 0;

  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const post = (path: string, body: object, token = adminToken) =>
    request(http).post(path).set(auth(token)).send(body);
  const patch = (path: string, body: object) => request(http).patch(path).set(auth()).send(body);

  const makeRoute = (active = true) => {
    counter += 1;
    return ctx.prisma.route.create({
      data: { origin: `Origen ${counter}`, destination: `Destino ${counter}`, active },
    });
  };
  const makeBus = (seats = 40, status: BusStatus = 'ACTIVE') => {
    counter += 1;
    return ctx.prisma.bus.create({
      data: {
        plate: `TST-${String(counter).padStart(3, '0')}`,
        brand: 'Volvo',
        model: 'B270F',
        seats,
        status,
      },
    });
  };
  const makeSchedule = (date: string, departure: string, arrival: string) =>
    ctx.prisma.schedule.create({
      data: {
        date: new Date(`${date}T00:00:00.000Z`),
        departureTime: time(departure),
        arrivalTime: time(arrival),
      },
    });

  /** Crea el conjunto completo de recursos para un turno nuevo (cada uno libre de choques). */
  async function resources(
    over: { date?: string; departure?: string; arrival?: string; seats?: number } = {},
  ) {
    const [route, bus, driver, schedule] = await Promise.all([
      makeRoute(),
      makeBus(over.seats),
      ctx.createUser('DRIVER'),
      makeSchedule(over.date ?? '2027-03-01', over.departure ?? '06:00', over.arrival ?? '07:00'),
    ]);
    return { route, bus, driver, schedule };
  }
  const body = (r: Awaited<ReturnType<typeof resources>>) => ({
    routeId: r.route.id,
    scheduleId: r.schedule.id,
    busId: r.bus.id,
    driverId: r.driver.id,
  });
  async function createShift(r: Awaited<ReturnType<typeof resources>>) {
    const res = await post('/shifts', body(r)).expect(201);
    return res.body as { id: string };
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
      const r = await resources();
      const shift = await createShift(r);
      const worker = await ctx.createUser('WORKER');
      const driverToken = await ctx.tokenFor(r.driver.username);
      const calls = [
        (t?: string) =>
          request(http)
            .get('/shifts')
            .set(t ? auth(t) : {}),
        (t?: string) =>
          request(http)
            .get(`/shifts/${shift.id}`)
            .set(t ? auth(t) : {}),
        (t?: string) =>
          request(http)
            .post('/shifts')
            .set(t ? auth(t) : {})
            .send(body(r)),
        (t?: string) =>
          request(http)
            .patch(`/shifts/${shift.id}`)
            .set(t ? auth(t) : {})
            .send({ active: false }),
        (t?: string) =>
          request(http)
            .post(`/shifts/${shift.id}/passengers`)
            .set(t ? auth(t) : {})
            .send({ workerIds: [worker.id] }),
        (t?: string) =>
          request(http)
            .delete(`/shifts/${shift.id}/passengers/${worker.id}`)
            .set(t ? auth(t) : {}),
      ];
      for (const call of calls) {
        await call().expect(401);
        await call(driverToken).expect(403);
      }
    });
  });

  describe('POST /shifts', () => {
    it('crea un turno activo con sus datos relacionados', async () => {
      const r = await resources();
      const res = await post('/shifts', body(r)).expect(201);
      expect(res.body).toMatchObject({
        active: true,
        passengerCount: 0,
        route: { id: r.route.id, origin: r.route.origin, destination: r.route.destination },
        schedule: { date: '2027-03-01', departureTime: '06:00', arrivalTime: '07:00' },
        bus: { id: r.bus.id, plate: r.bus.plate, seats: 40 },
        driver: { id: r.driver.id, fullName: r.driver.fullName },
      });
    });

    it('rechaza referencias que no existen (400)', async () => {
      const r = await resources();
      for (const key of ['routeId', 'scheduleId', 'busId', 'driverId'] as const) {
        await post('/shifts', { ...body(r), [key]: MISSING_ID }).expect(400);
      }
    });

    it('rechaza ruta, bus o conductor inactivos (409) y un conductor sin ese rol (400)', async () => {
      const r = await resources();
      const inactiveRoute = await makeRoute(false);
      const maintenanceBus = await makeBus(40, 'MAINTENANCE');
      const inactiveDriver = await ctx.createUser('DRIVER', { status: 'INACTIVE' });
      const worker = await ctx.createUser('WORKER');

      await post('/shifts', { ...body(r), routeId: inactiveRoute.id }).expect(409);
      await post('/shifts', { ...body(r), busId: maintenanceBus.id }).expect(409);
      await post('/shifts', { ...body(r), driverId: inactiveDriver.id }).expect(409);
      const notDriver = await post('/shifts', { ...body(r), driverId: worker.id }).expect(400);
      expect(notDriver.body.message).toMatch(/rol Conductor/);
    });

    it('valida el cuerpo: UUID, campos obligatorios y desconocidos', async () => {
      const r = await resources();
      await post('/shifts', { ...body(r), busId: 'no-es-uuid' }).expect(400);
      await post('/shifts', { routeId: r.route.id }).expect(400);
      await post('/shifts', { ...body(r), isFree: true }).expect(400);
    });

    it('impide que un bus esté en dos turnos activos que se solapan', async () => {
      const first = await resources({ departure: '06:00', arrival: '07:00' });
      await createShift(first);
      const overlapping = await makeSchedule('2027-03-01', '06:30', '07:30');
      const res = await post('/shifts', {
        ...body(await resources()),
        busId: first.bus.id,
        scheduleId: overlapping.id,
      }).expect(409);
      expect(res.body.message).toMatch(new RegExp(`bus ${first.bus.plate}.*de 06:00 a 07:00`));
    });

    it('impide que un conductor esté en dos turnos activos que se solapan', async () => {
      const first = await resources({ departure: '10:00', arrival: '11:00' });
      await createShift(first);
      const overlapping = await makeSchedule('2027-03-01', '10:59', '12:00');
      const res = await post('/shifts', {
        ...body(await resources()),
        driverId: first.driver.id,
        scheduleId: overlapping.id,
      }).expect(409);
      expect(res.body.message).toMatch(/conductor .* ya tiene un turno/);
    });

    it('permite turnos consecutivos (llegar cuando otro sale) y de otro día con el mismo bus', async () => {
      const first = await resources({ departure: '06:00', arrival: '07:00' });
      await createShift(first);
      const consecutive = await makeSchedule('2027-03-01', '07:00', '08:00');
      const otherDay = await makeSchedule('2027-03-02', '06:00', '07:00');
      const spare = await resources();

      await post('/shifts', {
        ...body(spare),
        busId: first.bus.id,
        scheduleId: consecutive.id,
      }).expect(201);
      await post('/shifts', {
        ...body(await resources()),
        busId: first.bus.id,
        scheduleId: otherDay.id,
      }).expect(201);
    });

    it('un turno inactivo no genera choques', async () => {
      const first = await resources({ departure: '14:00', arrival: '15:00' });
      await post('/shifts', { ...body(first), active: false }).expect(201);
      await post('/shifts', {
        ...body(await resources()),
        busId: first.bus.id,
        scheduleId: first.schedule.id,
      }).expect(201);
    });

    it('registra el alta en la auditoría', async () => {
      const shift = await createShift(await resources());
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'Shift', entityId: shift.id, action: 'SHIFT_CREATED' },
      });
      expect(log?.userId).toBe(admin.id);
    });
  });

  describe('GET /shifts', () => {
    it('lista con paginación, orden y filtros, e incluye el conteo de pasajeros', async () => {
      const early = await resources({ date: '2031-05-01', departure: '05:00', arrival: '06:00' });
      const late = await resources({ date: '2031-05-02', departure: '05:00', arrival: '06:00' });
      const earlyShift = await createShift(early);
      const lateShift = await createShift(late);
      const worker = await ctx.createUser('WORKER');
      await post(`/shifts/${earlyShift.id}/passengers`, { workerIds: [worker.id] }).expect(201);

      const all = await request(http)
        .get('/shifts?from=2031-05-01&to=2031-05-02')
        .set(auth())
        .expect(200);
      expect(all.body.total).toBe(2);
      // Fecha descendente: primero el más tardío.
      expect(all.body.items.map((s: { id: string }) => s.id)).toEqual([
        lateShift.id,
        earlyShift.id,
      ]);
      expect(all.body.items[1].passengerCount).toBe(1);

      const onlyEarly = await request(http)
        .get('/shifts?from=2031-05-01&to=2031-05-01')
        .set(auth())
        .expect(200);
      expect(onlyEarly.body.items.map((s: { id: string }) => s.id)).toEqual([earlyShift.id]);

      const byBus = await request(http).get(`/shifts?busId=${late.bus.id}`).set(auth()).expect(200);
      expect(byBus.body.items.map((s: { id: string }) => s.id)).toEqual([lateShift.id]);

      const paged = await request(http)
        .get('/shifts?from=2031-05-01&to=2031-05-02&page=2&pageSize=1')
        .set(auth())
        .expect(200);
      expect(paged.body.items).toHaveLength(1);
      expect(paged.body.total).toBe(2);
    });

    it('filtra por estado y valida los parámetros', async () => {
      const r = await resources({ date: '2032-01-10' });
      const shift = await createShift(r);
      await patch(`/shifts/${shift.id}`, { active: false }).expect(200);

      const inactive = await request(http)
        .get('/shifts?active=false&from=2032-01-10&to=2032-01-10')
        .set(auth())
        .expect(200);
      expect(inactive.body.items.map((s: { id: string }) => s.id)).toEqual([shift.id]);
      const active = await request(http)
        .get('/shifts?active=true&from=2032-01-10&to=2032-01-10')
        .set(auth())
        .expect(200);
      expect(active.body.items).toHaveLength(0);

      await request(http).get('/shifts?active=quizas').set(auth()).expect(400);
      await request(http).get('/shifts?from=2032-13-40').set(auth()).expect(400);
      await request(http).get('/shifts?from=2032-02-02&to=2032-01-01').set(auth()).expect(400);
      await request(http).get('/shifts?busId=nope').set(auth()).expect(400);
    });
  });

  describe('GET /shifts/:id', () => {
    it('devuelve el detalle con los pasajeros ordenados por nombre', async () => {
      const shift = await createShift(await resources());
      const zeta = await ctx.createUser('WORKER', { fullName: 'Zeta Zurita' });
      const alfa = await ctx.createUser('WORKER', { fullName: 'Alfa Aguirre' });
      await post(`/shifts/${shift.id}/passengers`, { workerIds: [zeta.id, alfa.id] }).expect(201);

      const res = await request(http).get(`/shifts/${shift.id}`).set(auth()).expect(200);
      expect(res.body.passengerCount).toBe(2);
      expect(res.body.passengers).toEqual([
        { workerId: alfa.id, fullName: 'Alfa Aguirre', dni: alfa.dni, attendance: 'PENDING' },
        { workerId: zeta.id, fullName: 'Zeta Zurita', dni: zeta.dni, attendance: 'PENDING' },
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|email/);
    });

    it('responde 404 si no existe y 400 si el id no es UUID', async () => {
      await request(http).get(`/shifts/${MISSING_ID}`).set(auth()).expect(404);
      await request(http).get('/shifts/no-es-uuid').set(auth()).expect(400);
    });
  });

  describe('PATCH /shifts/:id', () => {
    it('cambia el conductor y el bus', async () => {
      const r = await resources();
      const shift = await createShift(r);
      const newDriver = await ctx.createUser('DRIVER');
      const newBus = await makeBus(30);

      const res = await patch(`/shifts/${shift.id}`, {
        driverId: newDriver.id,
        busId: newBus.id,
      }).expect(200);
      expect(res.body.driver.id).toBe(newDriver.id);
      expect(res.body.bus).toMatchObject({ id: newBus.id, seats: 30 });
    });

    it('guardar los mismos valores no choca consigo mismo', async () => {
      const r = await resources();
      const shift = await createShift(r);
      await patch(`/shifts/${shift.id}`, body(r)).expect(200);
    });

    it('rechaza cambiar a un bus u horario que choca con otro turno', async () => {
      const a = await resources({ date: '2027-04-01', departure: '08:00', arrival: '09:00' });
      const b = await resources({ date: '2027-04-01', departure: '08:30', arrival: '09:30' });
      await createShift(a);
      const shiftB = await createShift(b);

      await patch(`/shifts/${shiftB.id}`, { busId: a.bus.id }).expect(409);
      await patch(`/shifts/${shiftB.id}`, { driverId: a.driver.id }).expect(409);
      // Mover B al mismo horario que A no choca por sí mismo (bus y conductor distintos).
      await patch(`/shifts/${shiftB.id}`, { scheduleId: a.schedule.id }).expect(200);
    });

    it('no permite cambiar a un bus con menos asientos que los pasajeros', async () => {
      const r = await resources({ seats: 40 });
      const shift = await createShift(r);
      const workers = await Promise.all([
        ctx.createUser('WORKER'),
        ctx.createUser('WORKER'),
        ctx.createUser('WORKER'),
      ]);
      await post(`/shifts/${shift.id}/passengers`, { workerIds: workers.map((w) => w.id) }).expect(
        201,
      );
      const small = await makeBus(2);

      const res = await patch(`/shifts/${shift.id}`, { busId: small.id }).expect(409);
      expect(res.body.message).toMatch(/2 asientos.*3 pasajeros/);
    });

    it('al cambiar de horario valida los choques de los pasajeros', async () => {
      const a = await resources({ date: '2027-05-01', departure: '06:00', arrival: '07:00' });
      const b = await resources({ date: '2027-05-01', departure: '12:00', arrival: '13:00' });
      const shiftA = await createShift(a);
      const shiftB = await createShift(b);
      const worker = await ctx.createUser('WORKER', { fullName: 'Pasajero Doble' });
      await post(`/shifts/${shiftA.id}/passengers`, { workerIds: [worker.id] }).expect(201);
      await post(`/shifts/${shiftB.id}/passengers`, { workerIds: [worker.id] }).expect(201);

      const res = await patch(`/shifts/${shiftB.id}`, { scheduleId: a.schedule.id }).expect(409);
      expect(res.body.message).toMatch(/Pasajero Doble ya está en otro turno/);
    });

    it('desactivar libera bus y conductor; reactivar vuelve a validar los choques', async () => {
      const r = await resources({ date: '2027-06-01', departure: '06:00', arrival: '07:00' });
      const shift = await createShift(r);
      await patch(`/shifts/${shift.id}`, { active: false }).expect(200);

      // Con el turno inactivo, otro turno puede usar el mismo bus y horario.
      const taker = await post('/shifts', {
        ...body(await resources()),
        busId: r.bus.id,
        scheduleId: r.schedule.id,
      }).expect(201);
      await patch(`/shifts/${shift.id}`, { active: true }).expect(409);

      await patch(`/shifts/${taker.body.id}`, { active: false }).expect(200);
      await patch(`/shifts/${shift.id}`, { active: true }).expect(200);
    });

    it('al reactivar exige que ruta, bus y conductor sigan activos', async () => {
      const r = await resources({ date: '2027-07-01' });
      const shift = await createShift(r);
      await patch(`/shifts/${shift.id}`, { active: false }).expect(200);
      await ctx.prisma.bus.update({ where: { id: r.bus.id }, data: { status: 'MAINTENANCE' } });

      const res = await patch(`/shifts/${shift.id}`, { active: true }).expect(409);
      expect(res.body.message).toMatch(/no está activo/);
    });

    it('responde 404 y valida el cuerpo', async () => {
      await patch(`/shifts/${MISSING_ID}`, { active: false }).expect(404);
      const shift = await createShift(await resources());
      await patch(`/shifts/${shift.id}`, { busId: 'x' }).expect(400);
      await patch(`/shifts/${shift.id}`, { extra: 1 }).expect(400);
    });

    it('registra los cambios de estado en la auditoría', async () => {
      const shift = await createShift(await resources());
      await patch(`/shifts/${shift.id}`, { active: false }).expect(200);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'Shift', entityId: shift.id, action: 'SHIFT_STATUS_CHANGED' },
      });
      expect(log).not.toBeNull();
    });
  });

  describe('pasajeros', () => {
    it('asigna varios colaboradores y deja registro de auditoría', async () => {
      const shift = await createShift(await resources());
      const workers = await Promise.all([ctx.createUser('WORKER'), ctx.createUser('WORKER')]);

      const res = await post(`/shifts/${shift.id}/passengers`, {
        workerIds: workers.map((w) => w.id),
      }).expect(201);
      expect(res.body.passengerCount).toBe(2);
      expect(res.body.passengers).toHaveLength(2);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entityId: shift.id, action: 'SHIFT_PASSENGERS_ADDED' },
      });
      expect(log?.changes).toEqual({ count: 2 });
    });

    it('solo acepta colaboradores activos que existan', async () => {
      const shift = await createShift(await resources());
      const driver = await ctx.createUser('DRIVER');
      const inactive = await ctx.createUser('WORKER', { status: 'INACTIVE' });

      await post(`/shifts/${shift.id}/passengers`, { workerIds: [driver.id] }).expect(400);
      await post(`/shifts/${shift.id}/passengers`, { workerIds: [inactive.id] }).expect(400);
      await post(`/shifts/${shift.id}/passengers`, { workerIds: [MISSING_ID] }).expect(400);
    });

    it('valida la lista: vacía, repetida o con ids inválidos', async () => {
      const shift = await createShift(await resources());
      const worker = await ctx.createUser('WORKER');
      await post(`/shifts/${shift.id}/passengers`, { workerIds: [] }).expect(400);
      await post(`/shifts/${shift.id}/passengers`, { workerIds: [worker.id, worker.id] }).expect(
        400,
      );
      await post(`/shifts/${shift.id}/passengers`, { workerIds: ['x'] }).expect(400);
      await post(`/shifts/${shift.id}/passengers`, {}).expect(400);
    });

    it('rechaza a quien ya está asignado a ese turno (409)', async () => {
      const shift = await createShift(await resources());
      const worker = await ctx.createUser('WORKER');
      await post(`/shifts/${shift.id}/passengers`, { workerIds: [worker.id] }).expect(201);
      const res = await post(`/shifts/${shift.id}/passengers`, { workerIds: [worker.id] }).expect(
        409,
      );
      expect(res.body.message).toMatch(/Ya están asignados/);
    });

    it('respeta la capacidad del bus y no asigna nada si no caben todos', async () => {
      const shift = await createShift(await resources({ seats: 2 }));
      const [a, b, c] = await Promise.all([
        ctx.createUser('WORKER'),
        ctx.createUser('WORKER'),
        ctx.createUser('WORKER'),
      ]);

      const tooMany = await post(`/shifts/${shift.id}/passengers`, {
        workerIds: [a.id, b.id, c.id],
      }).expect(409);
      expect(tooMany.body.message).toMatch(/Capacidad excedida.*2 asientos.*quedan 2 libres/);
      expect((await request(http).get(`/shifts/${shift.id}`).set(auth())).body.passengerCount).toBe(
        0,
      );

      await post(`/shifts/${shift.id}/passengers`, { workerIds: [a.id, b.id] }).expect(201);
      const full = await post(`/shifts/${shift.id}/passengers`, { workerIds: [c.id] }).expect(409);
      expect(full.body.message).toMatch(/está lleno/);
    });

    it('impide que un colaborador esté en dos turnos solapados, pero permite horarios distintos', async () => {
      const a = await resources({ date: '2027-08-01', departure: '06:00', arrival: '07:00' });
      const b = await resources({ date: '2027-08-01', departure: '06:30', arrival: '07:30' });
      const c = await resources({ date: '2027-08-01', departure: '07:00', arrival: '08:00' });
      const [shiftA, shiftB, shiftC] = await Promise.all([
        createShift(a),
        createShift(b),
        createShift(c),
      ]);
      const worker = await ctx.createUser('WORKER', { fullName: 'Elena Paredes' });

      await post(`/shifts/${shiftA.id}/passengers`, { workerIds: [worker.id] }).expect(201);
      const clash = await post(`/shifts/${shiftB.id}/passengers`, {
        workerIds: [worker.id],
      }).expect(409);
      expect(clash.body.message).toMatch(
        /Elena Paredes ya está en otro turno ese día de 06:00 a 07:00/,
      );
      await post(`/shifts/${shiftC.id}/passengers`, { workerIds: [worker.id] }).expect(201);
    });

    it('no asigna pasajeros a un turno inactivo ni a uno inexistente', async () => {
      const shift = await createShift(await resources());
      const worker = await ctx.createUser('WORKER');
      await patch(`/shifts/${shift.id}`, { active: false }).expect(200);
      await post(`/shifts/${shift.id}/passengers`, { workerIds: [worker.id] }).expect(409);
      await post(`/shifts/${MISSING_ID}/passengers`, { workerIds: [worker.id] }).expect(404);
    });

    it('quita pasajeros y libera el asiento', async () => {
      const shift = await createShift(await resources({ seats: 2 }));
      const [a, b, c] = await Promise.all([
        ctx.createUser('WORKER'),
        ctx.createUser('WORKER'),
        ctx.createUser('WORKER'),
      ]);
      await post(`/shifts/${shift.id}/passengers`, { workerIds: [a.id, b.id] }).expect(201);

      await request(http).delete(`/shifts/${shift.id}/passengers/${a.id}`).set(auth()).expect(204);
      await post(`/shifts/${shift.id}/passengers`, { workerIds: [c.id] }).expect(201);
      await request(http).delete(`/shifts/${shift.id}/passengers/${a.id}`).set(auth()).expect(404);
    });

    it('no permite quitar a quien ya tiene la asistencia registrada', async () => {
      const shift = await createShift(await resources());
      const worker = await ctx.createUser('WORKER');
      await post(`/shifts/${shift.id}/passengers`, { workerIds: [worker.id] }).expect(201);
      await ctx.prisma.shiftPassenger.updateMany({
        where: { shiftId: shift.id, workerId: worker.id },
        data: { attendance: 'PRESENT', markedAt: new Date() },
      });

      const res = await request(http)
        .delete(`/shifts/${shift.id}/passengers/${worker.id}`)
        .set(auth())
        .expect(409);
      expect(res.body.message).toMatch(/asistencia registrada/);
    });
  });

  describe('reglas cruzadas con otros módulos', () => {
    async function activeShift(seats = 40, date = '2027-03-01') {
      const r = await resources({ seats, date });
      const shift = await createShift(r);
      return { r, shift };
    }

    it('un bus con turnos activos no puede ir a mantenimiento ni darse de baja', async () => {
      const { r, shift } = await activeShift();
      const res = await patch(`/buses/${r.bus.id}`, { status: 'MAINTENANCE' }).expect(409);
      expect(res.body.message).toMatch(/1 turno activo/);
      await patch(`/buses/${r.bus.id}`, { status: 'RETIRED' }).expect(409);

      await patch(`/shifts/${shift.id}`, { active: false }).expect(200);
      await patch(`/buses/${r.bus.id}`, { status: 'MAINTENANCE' }).expect(200);
    });

    it('no se pueden reducir los asientos de un bus por debajo de los pasajeros de un turno activo', async () => {
      const { r, shift } = await activeShift(40);
      const workers = await Promise.all(Array.from({ length: 12 }, () => ctx.createUser('WORKER')));
      await post(`/shifts/${shift.id}/passengers`, { workerIds: workers.map((w) => w.id) }).expect(
        201,
      );

      const res = await patch(`/buses/${r.bus.id}`, { seats: 11 }).expect(409);
      expect(res.body.message).toMatch(/12 pasajeros/);
      await patch(`/buses/${r.bus.id}`, { seats: 12 }).expect(200);
      await patch(`/buses/${r.bus.id}`, { seats: 60 }).expect(200);
    });

    it('una ruta con turnos activos no se puede desactivar', async () => {
      const { r, shift } = await activeShift();
      const res = await patch(`/routes/${r.route.id}`, { active: false }).expect(409);
      expect(res.body.message).toMatch(/1 turno activo/);

      await patch(`/shifts/${shift.id}`, { active: false }).expect(200);
      await patch(`/routes/${r.route.id}`, { active: false }).expect(200);
    });

    it('un horario usado por turnos no cambia de fecha ni de horas, pero sí se puede dejar igual', async () => {
      // Fecha propia: la unicidad (fecha, salida, llegada) se valida al editar el horario.
      const { r } = await activeShift(40, '2033-01-05');
      const res = await patch(`/schedules/${r.schedule.id}`, { departureTime: '05:00' }).expect(
        409,
      );
      expect(res.body.message).toMatch(/asignado a 1 turno/);
      await patch(`/schedules/${r.schedule.id}`, { departureTime: '06:00' }).expect(200);
    });

    it('un conductor con turnos activos no se puede desactivar ni cambiar de rol', async () => {
      const { r, shift } = await activeShift();
      const res = await patch(`/users/${r.driver.id}`, { status: 'INACTIVE' }).expect(409);
      expect(res.body.message).toMatch(/1 turno activo/);
      await patch(`/users/${r.driver.id}`, { role: 'WORKER' }).expect(409);

      await patch(`/shifts/${shift.id}`, { active: false }).expect(200);
      await patch(`/users/${r.driver.id}`, { status: 'INACTIVE' }).expect(200);
    });
  });
});
