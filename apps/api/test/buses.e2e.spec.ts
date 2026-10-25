import request from 'supertest';
import { createTestContext, TestContext } from './helpers/test-app';

jest.setTimeout(60_000);

const validBus = (overrides: Record<string, unknown> = {}) => ({
  plate: 'abc-123',
  brand: 'Mercedes-Benz',
  model: 'OF 1721',
  seats: 40,
  ...overrides,
});

describe('Buses (e2e)', () => {
  let ctx: TestContext;
  let http: ReturnType<TestContext['app']['getHttpServer']>;
  let adminToken: string;
  let admin: Awaited<ReturnType<TestContext['createUser']>>;

  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) =>
    request(http).post('/buses').set(auth(token)).send(body);

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
      await request(http).get('/buses').expect(401);
      await request(http).post('/buses').send(validBus()).expect(401);
    });

    it('prohíbe a conductores y colaboradores', async () => {
      const created = await post(validBus({ plate: 'ACC-001' })).expect(201);
      for (const role of ['DRIVER', 'WORKER'] as const) {
        const user = await ctx.createUser(role);
        const token = await ctx.tokenFor(user.username);
        await request(http).get('/buses').set(auth(token)).expect(403);
        await request(http).get(`/buses/${created.body.id}`).set(auth(token)).expect(403);
        await post(validBus({ plate: `X-${role}` }), token).expect(403);
        await request(http)
          .patch(`/buses/${created.body.id}`)
          .set(auth(token))
          .send({ seats: 20 })
          .expect(403);
      }
    });
  });

  describe('POST /buses', () => {
    it('crea un bus y normaliza la placa a mayúsculas', async () => {
      const res = await post(validBus({ plate: ' xyz-789 ' })).expect(201);
      expect(res.body).toMatchObject({
        plate: 'XYZ-789',
        brand: 'Mercedes-Benz',
        model: 'OF 1721',
        seats: 40,
        status: 'ACTIVE',
      });
      expect(typeof res.body.id).toBe('string');
    });

    it('acepta un estado inicial', async () => {
      const res = await post(validBus({ plate: 'MNT-001', status: 'MAINTENANCE' })).expect(201);
      expect(res.body.status).toBe('MAINTENANCE');
    });

    it('rechaza una placa repetida con 409, también si cambian las mayúsculas', async () => {
      await post(validBus({ plate: 'DUP-100' })).expect(201);
      const same = await post(validBus({ plate: 'DUP-100' })).expect(409);
      expect(same.body.message).toMatch(/placa/i);
      await post(validBus({ plate: 'dup-100' })).expect(409);
    });

    it('valida los campos', async () => {
      const bad: Record<string, unknown>[] = [
        { seats: 9 },
        { seats: 81 },
        { seats: 40.5 },
        { seats: 'muchos' },
        { plate: 'AB' },
        { plate: 'PLACA INVALIDA!' },
        { plate: 'ABCDEFGHIJK' },
        { brand: 'A' },
        { model: '' },
        { status: 'VOLANDO' },
      ];
      for (const [index, override] of bad.entries()) {
        await post(validBus({ plate: `VAL-${index}00`, ...override })).expect(400);
      }
    });

    it('acepta los límites de asientos (10 y 80)', async () => {
      await post(validBus({ plate: 'MIN-010', seats: 10 })).expect(201);
      await post(validBus({ plate: 'MAX-080', seats: 80 })).expect(201);
    });

    it('rechaza campos desconocidos y cuerpos incompletos', async () => {
      await post(validBus({ plate: 'EXT-001', color: 'rojo' })).expect(400);
      await post({ plate: 'INC-001' }).expect(400);
    });

    it('registra la creación en la auditoría', async () => {
      const res = await post(validBus({ plate: 'AUD-001' })).expect(201);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'Bus', entityId: res.body.id, action: 'BUS_CREATED' },
      });
      expect(log?.userId).toBe(admin.id);
      expect(log?.changes).toEqual({ plate: 'AUD-001' });
    });
  });

  describe('GET /buses', () => {
    beforeAll(async () => {
      await post(validBus({ plate: 'LST-001', brand: 'Volvo', model: 'B270F', seats: 45 }));
      await post(validBus({ plate: 'LST-002', brand: 'Scania', model: 'K310', seats: 50 }));
      await post(
        validBus({
          plate: 'LST-003',
          brand: 'Volvo',
          model: 'B290R',
          seats: 52,
          status: 'RETIRED',
        }),
      );
    });

    it('devuelve una página con el total', async () => {
      const res = await request(http).get('/buses?page=1&pageSize=2').set(auth()).expect(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body).toMatchObject({ page: 1, pageSize: 2 });
      expect(res.body.total).toBeGreaterThan(2);

      const second = await request(http).get('/buses?page=2&pageSize=2').set(auth()).expect(200);
      expect(second.body.items[0].id).not.toBe(res.body.items[0].id);
    });

    it('ordena por placa', async () => {
      const res = await request(http).get('/buses?pageSize=100').set(auth()).expect(200);
      const plates: string[] = res.body.items.map((b: { plate: string }) => b.plate);
      expect(plates).toEqual([...plates].sort());
    });

    it('busca por placa, marca o modelo sin distinguir mayúsculas', async () => {
      for (const [search, plate] of [
        ['lst-002', 'LST-002'],
        ['SCANIA', 'LST-002'],
        ['b270', 'LST-001'],
      ]) {
        const res = await request(http).get('/buses').query({ search }).set(auth()).expect(200);
        expect(res.body.items.map((b: { plate: string }) => b.plate)).toContain(plate);
      }
    });

    it('filtra por estado y combina con la búsqueda', async () => {
      const retired = await request(http)
        .get('/buses?status=RETIRED&search=volvo')
        .set(auth())
        .expect(200);
      expect(retired.body.items.map((b: { plate: string }) => b.plate)).toEqual(['LST-003']);
    });

    it('valida los parámetros de consulta', async () => {
      await request(http).get('/buses?page=0').set(auth()).expect(400);
      await request(http).get('/buses?pageSize=1000').set(auth()).expect(400);
      await request(http).get('/buses?status=NADA').set(auth()).expect(400);
    });
  });

  describe('GET /buses/:id', () => {
    it('devuelve el bus', async () => {
      const created = await post(validBus({ plate: 'GET-001' })).expect(201);
      const res = await request(http).get(`/buses/${created.body.id}`).set(auth()).expect(200);
      expect(res.body).toMatchObject({ id: created.body.id, plate: 'GET-001' });
    });

    it('responde 404 si no existe y 400 si el id no es un UUID', async () => {
      await request(http)
        .get('/buses/00000000-0000-4000-8000-000000000000')
        .set(auth())
        .expect(404);
      await request(http).get('/buses/no-es-uuid').set(auth()).expect(400);
    });
  });

  describe('PATCH /buses/:id', () => {
    it('actualiza solo los campos enviados', async () => {
      const created = await post(validBus({ plate: 'UPD-001' })).expect(201);
      const res = await request(http)
        .patch(`/buses/${created.body.id}`)
        .set(auth())
        .send({ seats: 55, model: 'Modelo Nuevo' })
        .expect(200);
      expect(res.body).toMatchObject({
        plate: 'UPD-001',
        brand: 'Mercedes-Benz',
        model: 'Modelo Nuevo',
        seats: 55,
      });
    });

    it('permite guardar la misma placa sin dar conflicto y normaliza al cambiarla', async () => {
      const created = await post(validBus({ plate: 'SAM-001' })).expect(201);
      await request(http)
        .patch(`/buses/${created.body.id}`)
        .set(auth())
        .send({ plate: 'sam-001' })
        .expect(200);
      const res = await request(http)
        .patch(`/buses/${created.body.id}`)
        .set(auth())
        .send({ plate: 'sam-002' })
        .expect(200);
      expect(res.body.plate).toBe('SAM-002');
    });

    it('rechaza la placa de otro bus con 409', async () => {
      const a = await post(validBus({ plate: 'OWN-001' })).expect(201);
      await post(validBus({ plate: 'OWN-002' })).expect(201);
      const res = await request(http)
        .patch(`/buses/${a.body.id}`)
        .set(auth())
        .send({ plate: 'own-002' })
        .expect(409);
      expect(res.body.message).toMatch(/placa/i);
    });

    it('cambia el estado y lo registra como BUS_STATUS_CHANGED', async () => {
      const created = await post(validBus({ plate: 'STA-001' })).expect(201);
      for (const status of ['MAINTENANCE', 'RETIRED', 'ACTIVE']) {
        const res = await request(http)
          .patch(`/buses/${created.body.id}`)
          .set(auth())
          .send({ status })
          .expect(200);
        expect(res.body.status).toBe(status);
      }
      const logs = await ctx.prisma.auditLog.count({
        where: { entityId: created.body.id, action: 'BUS_STATUS_CHANGED' },
      });
      expect(logs).toBe(3);
    });

    it('una edición sin cambio de estado se audita como BUS_UPDATED con solo nombres de campos', async () => {
      const created = await post(validBus({ plate: 'UPA-001' })).expect(201);
      await request(http)
        .patch(`/buses/${created.body.id}`)
        .set(auth())
        .send({ seats: 60 })
        .expect(200);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entityId: created.body.id, action: 'BUS_UPDATED' },
      });
      expect(log?.changes).toEqual({ fields: ['seats'] });
    });

    it('valida los datos y rechaza campos desconocidos', async () => {
      const created = await post(validBus({ plate: 'PVA-001' })).expect(201);
      const url = `/buses/${created.body.id}`;
      await request(http).patch(url).set(auth()).send({ seats: 5 }).expect(400);
      await request(http).patch(url).set(auth()).send({ plate: '!' }).expect(400);
      await request(http).patch(url).set(auth()).send({ status: 'X' }).expect(400);
      await request(http).patch(url).set(auth()).send({ color: 'rojo' }).expect(400);
    });

    it('responde 404 si el bus no existe', async () => {
      await request(http)
        .patch('/buses/00000000-0000-4000-8000-000000000000')
        .set(auth())
        .send({ seats: 20 })
        .expect(404);
    });
  });
});
