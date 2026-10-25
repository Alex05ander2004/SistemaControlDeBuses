import request from 'supertest';
import { createTestContext, TestContext } from './helpers/test-app';

jest.setTimeout(60_000);

const NOT_FOUND_ID = '00000000-0000-4000-8000-000000000000';

const validSchedule = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-11-02',
  departureTime: '06:30',
  arrivalTime: '07:30',
  ...overrides,
});

describe('Horarios (e2e)', () => {
  let ctx: TestContext;
  let http: ReturnType<TestContext['app']['getHttpServer']>;
  let adminToken: string;
  let admin: Awaited<ReturnType<TestContext['createUser']>>;

  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) =>
    request(http).post('/schedules').set(auth(token)).send(body);
  const patch = (id: string, body: object) =>
    request(http).patch(`/schedules/${id}`).set(auth()).send(body);

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
    it('exige sesión', async () => {
      await request(http).get('/schedules').expect(401);
      await request(http).post('/schedules').send(validSchedule()).expect(401);
      await request(http).delete(`/schedules/${NOT_FOUND_ID}`).expect(401);
    });

    it('prohíbe a conductores y colaboradores', async () => {
      for (const role of ['DRIVER', 'WORKER'] as const) {
        const user = await ctx.createUser(role);
        const token = await ctx.tokenFor(user.username);
        await request(http).get('/schedules').set(auth(token)).expect(403);
        await post(validSchedule({ date: '2030-01-01' }), token).expect(403);
        await request(http)
          .patch(`/schedules/${NOT_FOUND_ID}`)
          .set(auth(token))
          .send({})
          .expect(403);
        await request(http).delete(`/schedules/${NOT_FOUND_ID}`).set(auth(token)).expect(403);
      }
    });
  });

  describe('POST /schedules', () => {
    it('crea un horario y lo devuelve con fecha AAAA-MM-DD y horas HH:mm', async () => {
      const res = await post(validSchedule({ date: '2026-12-01' })).expect(201);
      expect(res.body).toMatchObject({
        date: '2026-12-01',
        departureTime: '06:30',
        arrivalTime: '07:30',
      });
      expect(res.body.id).toEqual(expect.any(String));
    });

    it('acepta los extremos del día', async () => {
      const res = await post(
        validSchedule({ date: '2026-12-02', departureTime: '00:00', arrivalTime: '23:59' }),
      ).expect(201);
      expect(res.body).toMatchObject({ departureTime: '00:00', arrivalTime: '23:59' });
    });

    it('rechaza fechas imposibles o con formato incorrecto', async () => {
      const impossible = await post(validSchedule({ date: '2026-02-31' })).expect(400);
      expect(impossible.body.message).toMatch(/fecha válida/);
      await post(validSchedule({ date: '02/11/2026' })).expect(400);
      await post(validSchedule({ date: '2026-13-01' })).expect(400);
      await post(validSchedule({ date: undefined })).expect(400);
    });

    it('rechaza horas con formato inválido', async () => {
      for (const bad of ['24:00', '7:30', '07:60', '0730', '07:30:00', 'abc', '']) {
        await post(validSchedule({ date: '2027-01-01', departureTime: bad })).expect(400);
        await post(validSchedule({ date: '2027-01-01', arrivalTime: bad })).expect(400);
      }
    });

    it('exige que la llegada sea posterior a la salida', async () => {
      const equal = await post(
        validSchedule({ date: '2027-01-02', departureTime: '08:00', arrivalTime: '08:00' }),
      ).expect(400);
      expect(equal.body.message).toMatch(/posterior/);
      await post(
        validSchedule({ date: '2027-01-02', departureTime: '22:00', arrivalTime: '01:00' }),
      ).expect(400);
    });

    it('rechaza campos desconocidos', async () => {
      await post(validSchedule({ date: '2027-01-03', turno: 'noche' })).expect(400);
    });

    it('rechaza un horario duplicado con 409', async () => {
      await post(validSchedule({ date: '2027-02-01' })).expect(201);
      const dup = await post(validSchedule({ date: '2027-02-01' })).expect(409);
      expect(dup.body.message).toMatch(/Ya existe/);
      // Misma fecha pero distinta hora de llegada no es duplicado.
      await post(validSchedule({ date: '2027-02-01', arrivalTime: '07:45' })).expect(201);
    });

    it('registra la creación en la auditoría', async () => {
      const res = await post(validSchedule({ date: '2027-02-02' })).expect(201);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'Schedule', entityId: res.body.id, action: 'SCHEDULE_CREATED' },
      });
      expect(log?.userId).toBe(admin.id);
      expect(log?.changes).toMatchObject({ date: '2027-02-02', departureTime: '06:30' });
    });
  });

  describe('GET /schedules', () => {
    beforeAll(async () => {
      // Fechas de un rango propio (2040) para aislar estos tests del resto.
      for (const [date, departureTime, arrivalTime] of [
        ['2040-03-10', '09:00', '10:00'],
        ['2040-03-10', '06:00', '07:00'],
        ['2040-03-11', '08:00', '09:30'],
        ['2040-03-12', '07:00', '08:00'],
        ['2040-03-13', '07:00', '08:00'],
      ]) {
        await post({ date, departureTime, arrivalTime }).expect(201);
      }
    });

    const inRange = (query: Record<string, string | number>) =>
      request(http)
        .get('/schedules')
        .query({ from: '2040-03-01', to: '2040-03-31', ...query })
        .set(auth());

    it('ordena por fecha descendente y luego por hora de salida ascendente', async () => {
      const res = await inRange({ pageSize: 10 }).expect(200);
      expect(res.body.total).toBe(5);
      expect(
        res.body.items.map(
          (s: { date: string; departureTime: string }) => `${s.date} ${s.departureTime}`,
        ),
      ).toEqual([
        '2040-03-13 07:00',
        '2040-03-12 07:00',
        '2040-03-11 08:00',
        '2040-03-10 06:00',
        '2040-03-10 09:00',
      ]);
    });

    it('pagina y devuelve el total', async () => {
      const first = await inRange({ page: 1, pageSize: 2 }).expect(200);
      expect(first.body).toMatchObject({ total: 5, page: 1, pageSize: 2 });
      expect(first.body.items).toHaveLength(2);
      const last = await inRange({ page: 3, pageSize: 2 }).expect(200);
      expect(last.body.items).toHaveLength(1);
    });

    it('filtra por rango de fechas inclusivo', async () => {
      const res = await request(http)
        .get('/schedules?from=2040-03-11&to=2040-03-12')
        .set(auth())
        .expect(200);
      expect(res.body.items.map((s: { date: string }) => s.date)).toEqual([
        '2040-03-12',
        '2040-03-11',
      ]);

      const onlyFrom = await request(http)
        .get('/schedules?from=2040-03-13')
        .set(auth())
        .expect(200);
      expect(onlyFrom.body.items.every((s: { date: string }) => s.date >= '2040-03-13')).toBe(true);

      const onlyTo = await request(http).get('/schedules?to=2040-03-10').set(auth()).expect(200);
      expect(onlyTo.body.items.every((s: { date: string }) => s.date <= '2040-03-10')).toBe(true);
    });

    it('valida los filtros: formato incorrecto, fecha imposible y from > to', async () => {
      await request(http).get('/schedules?from=hoy').set(auth()).expect(400);
      await request(http).get('/schedules?to=2040-02-31').set(auth()).expect(400);
      const inverted = await request(http)
        .get('/schedules?from=2040-03-20&to=2040-03-10')
        .set(auth())
        .expect(400);
      expect(inverted.body.message).toMatch(/from/);
    });

    it('valida la paginación', async () => {
      await request(http).get('/schedules?page=0').set(auth()).expect(400);
      await request(http).get('/schedules?pageSize=1000').set(auth()).expect(400);
    });
  });

  describe('GET /schedules/:id', () => {
    it('devuelve el horario', async () => {
      const created = await post(validSchedule({ date: '2027-03-01' })).expect(201);
      const res = await request(http).get(`/schedules/${created.body.id}`).set(auth()).expect(200);
      expect(res.body).toMatchObject({ id: created.body.id, date: '2027-03-01' });
    });

    it('responde 404 si no existe y 400 si el id no es un UUID', async () => {
      await request(http).get(`/schedules/${NOT_FOUND_ID}`).set(auth()).expect(404);
      await request(http).get('/schedules/no-es-uuid').set(auth()).expect(400);
    });
  });

  describe('PATCH /schedules/:id', () => {
    it('actualiza solo los campos enviados', async () => {
      const created = await post(validSchedule({ date: '2027-04-01' })).expect(201);
      const res = await patch(created.body.id, { date: '2027-04-02' }).expect(200);
      expect(res.body).toMatchObject({
        date: '2027-04-02',
        departureTime: '06:30',
        arrivalTime: '07:30',
      });
    });

    it('al cambiar solo la salida valida contra la llegada actual', async () => {
      const created = await post(validSchedule({ date: '2027-04-03' })).expect(201);
      const ok = await patch(created.body.id, { departureTime: '07:00' }).expect(200);
      expect(ok.body).toMatchObject({ departureTime: '07:00', arrivalTime: '07:30' });

      const bad = await patch(created.body.id, { departureTime: '07:30' }).expect(400);
      expect(bad.body.message).toMatch(/posterior/);
      await patch(created.body.id, { departureTime: '09:00' }).expect(400);
    });

    it('al cambiar solo la llegada valida contra la salida actual', async () => {
      const created = await post(validSchedule({ date: '2027-04-04' })).expect(201);
      await patch(created.body.id, { arrivalTime: '06:30' }).expect(400);
      await patch(created.body.id, { arrivalTime: '06:00' }).expect(400);
      const ok = await patch(created.body.id, { arrivalTime: '08:15' }).expect(200);
      expect(ok.body.arrivalTime).toBe('08:15');
    });

    it('permite guardar los mismos valores sin dar conflicto consigo mismo', async () => {
      const created = await post(validSchedule({ date: '2027-04-05' })).expect(201);
      await patch(created.body.id, validSchedule({ date: '2027-04-05' })).expect(200);
    });

    it('responde 409 al chocar con otro horario', async () => {
      await post(validSchedule({ date: '2027-04-06' })).expect(201);
      const other = await post(validSchedule({ date: '2027-04-07' })).expect(201);
      const res = await patch(other.body.id, { date: '2027-04-06' }).expect(409);
      expect(res.body.message).toMatch(/Ya existe/);
    });

    it('rechaza fechas imposibles y campos desconocidos', async () => {
      const created = await post(validSchedule({ date: '2027-04-08' })).expect(201);
      await patch(created.body.id, { date: '2027-02-30' }).expect(400);
      await patch(created.body.id, { turno: 'x' }).expect(400);
    });

    it('responde 404 si no existe', async () => {
      await patch(NOT_FOUND_ID, { date: '2027-05-01' }).expect(404);
    });

    it('registra la edición en la auditoría', async () => {
      const created = await post(validSchedule({ date: '2027-04-09' })).expect(201);
      await patch(created.body.id, { arrivalTime: '08:00' }).expect(200);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'Schedule', entityId: created.body.id, action: 'SCHEDULE_UPDATED' },
      });
      expect(log?.changes).toEqual({ fields: ['arrivalTime'] });
    });
  });

  describe('DELETE /schedules/:id', () => {
    it('elimina un horario libre con 204 y deja registro de auditoría', async () => {
      const created = await post(validSchedule({ date: '2027-06-01' })).expect(201);
      await request(http).delete(`/schedules/${created.body.id}`).set(auth()).expect(204);
      await request(http).get(`/schedules/${created.body.id}`).set(auth()).expect(404);

      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'Schedule', entityId: created.body.id, action: 'SCHEDULE_DELETED' },
      });
      expect(log?.userId).toBe(admin.id);
      expect(log?.changes).toMatchObject({ date: '2027-06-01' });
    });

    it('responde 404 si no existe y 400 si el id no es un UUID', async () => {
      await request(http).delete(`/schedules/${NOT_FOUND_ID}`).set(auth()).expect(404);
      await request(http).delete('/schedules/no-es-uuid').set(auth()).expect(400);
    });

    it('responde 409 si algún turno usa el horario y no lo borra', async () => {
      const created = await post(validSchedule({ date: '2027-06-02' })).expect(201);
      const driver = await ctx.createUser('DRIVER');
      const route = await ctx.prisma.route.create({
        data: { origin: 'Los Olivos', destination: 'Planta Central' },
      });
      const bus = await ctx.prisma.bus.create({
        data: { plate: 'HOR-001', brand: 'Volvo', model: 'B270F', seats: 40 },
      });
      await ctx.prisma.shift.create({
        data: {
          routeId: route.id,
          scheduleId: created.body.id,
          busId: bus.id,
          driverId: driver.id,
        },
      });

      const res = await request(http)
        .delete(`/schedules/${created.body.id}`)
        .set(auth())
        .expect(409);
      expect(res.body.message).toMatch(/asignado a 1 turno/);
      await request(http).get(`/schedules/${created.body.id}`).set(auth()).expect(200);
    });
  });
});
