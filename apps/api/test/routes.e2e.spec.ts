import request from 'supertest';
import { createTestContext, TestContext } from './helpers/test-app';

jest.setTimeout(60_000);

describe('Rutas (e2e)', () => {
  let ctx: TestContext;
  let http: ReturnType<TestContext['app']['getHttpServer']>;
  let adminToken: string;
  let admin: Awaited<ReturnType<TestContext['createUser']>>;

  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) =>
    request(http).post('/routes').set(auth(token)).send(body);

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
      await request(http).get('/routes').expect(401);
      await request(http).post('/routes').send({ origin: 'A1', destination: 'B1' }).expect(401);
    });

    it('prohíbe a conductores y colaboradores', async () => {
      for (const role of ['DRIVER', 'WORKER'] as const) {
        const user = await ctx.createUser(role);
        const token = await ctx.tokenFor(user.username);
        await request(http).get('/routes').set(auth(token)).expect(403);
        await post({ origin: 'Sin permiso', destination: 'Nada' }, token).expect(403);
        await request(http)
          .patch('/routes/00000000-0000-4000-8000-000000000000')
          .set(auth(token))
          .send({ active: false })
          .expect(403);
      }
    });
  });

  describe('POST /routes', () => {
    it('crea una ruta activa por defecto', async () => {
      const res = await post({ origin: 'Los Olivos', destination: 'Planta Central' }).expect(201);
      expect(res.body).toMatchObject({
        origin: 'Los Olivos',
        destination: 'Planta Central',
        active: true,
      });
      expect(res.body.id).toEqual(expect.any(String));
    });

    it('permite crearla inactiva', async () => {
      const res = await post({
        origin: 'Callao',
        destination: 'Sede Almacén',
        active: false,
      }).expect(201);
      expect(res.body.active).toBe(false);
    });

    it('recorta y colapsa los espacios del origen y el destino', async () => {
      const res = await post({
        origin: '  Villa   El  Salvador ',
        destination: '\tPlanta    Sur  ',
      }).expect(201);
      expect(res.body).toMatchObject({ origin: 'Villa El Salvador', destination: 'Planta Sur' });
    });

    it('rechaza origen y destino iguales, también si solo cambian las mayúsculas', async () => {
      const same = await post({ origin: 'Ate', destination: 'Ate' }).expect(400);
      expect(same.body.message).toMatch(/distintos/);
      await post({ origin: 'Ate Vitarte', destination: 'ATE   vitarte' }).expect(400);
    });

    it('rechaza una ruta repetida con 409, también por mayúsculas y espacios', async () => {
      await post({ origin: 'Surco', destination: 'Planta Norte' }).expect(201);
      const same = await post({ origin: 'Surco', destination: 'Planta Norte' }).expect(409);
      expect(same.body.message).toMatch(/Ya existe una ruta/);
      await post({ origin: 'SURCO', destination: ' planta   norte ' }).expect(409);
    });

    it('el sentido contrario es otra ruta', async () => {
      await post({ origin: 'Comas', destination: 'Planta Este' }).expect(201);
      await post({ origin: 'Planta Este', destination: 'Comas' }).expect(201);
    });

    it('valida los campos', async () => {
      const bad: Record<string, unknown>[] = [
        { origin: 'A' },
        { destination: 'B' },
        { origin: '' },
        { destination: ' ' },
        { origin: 'x'.repeat(121) },
        { origin: 123 },
        { active: 'si' },
      ];
      for (const override of bad) {
        await post({ origin: 'Origen valido', destination: 'Destino valido', ...override }).expect(
          400,
        );
      }
      await post({ destination: 'Solo destino' }).expect(400);
    });

    it('rechaza campos desconocidos', async () => {
      await post({ origin: 'Origen extra', destination: 'Destino extra', color: 'rojo' }).expect(
        400,
      );
    });

    it('registra la creación en la auditoría con nombres de campos o datos públicos', async () => {
      const res = await post({
        origin: 'Auditoría Origen',
        destination: 'Auditoría Destino',
      }).expect(201);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'Route', entityId: res.body.id, action: 'ROUTE_CREATED' },
      });
      expect(log?.userId).toBe(admin.id);
      expect(log?.changes).toMatchObject({ origin: 'Auditoría Origen' });
    });
  });

  describe('GET /routes', () => {
    beforeAll(async () => {
      await post({ origin: 'Miraflores', destination: 'Oficina Lima' });
      await post({ origin: 'San Borja', destination: 'Oficina Lima', active: false });
      await post({ origin: 'Pueblo Libre', destination: 'Puerto Norte', active: false });
    });

    it('devuelve una página con el total', async () => {
      const res = await request(http).get('/routes?page=1&pageSize=2').set(auth()).expect(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body).toMatchObject({ page: 1, pageSize: 2 });
      expect(res.body.total).toBeGreaterThan(2);

      const second = await request(http).get('/routes?page=2&pageSize=2').set(auth()).expect(200);
      expect(second.body.items[0].id).not.toBe(res.body.items[0].id);
    });

    it('busca por origen o destino sin distinguir mayúsculas', async () => {
      const byOrigin = await request(http)
        .get('/routes')
        .query({ search: 'MIRAFLORES' })
        .set(auth())
        .expect(200);
      expect(byOrigin.body.items.map((r: { origin: string }) => r.origin)).toEqual(['Miraflores']);

      const byDestination = await request(http)
        .get('/routes')
        .query({ search: 'oficina lima' })
        .set(auth())
        .expect(200);
      expect(byDestination.body.items.map((r: { origin: string }) => r.origin).sort()).toEqual([
        'Miraflores',
        'San Borja',
      ]);
    });

    it('filtra por estado', async () => {
      const inactive = await request(http)
        .get('/routes?active=false&search=oficina lima')
        .set(auth())
        .expect(200);
      expect(inactive.body.items.map((r: { origin: string }) => r.origin)).toEqual(['San Borja']);

      const active = await request(http)
        .get('/routes?active=true&search=oficina lima')
        .set(auth())
        .expect(200);
      expect(active.body.items.map((r: { origin: string }) => r.origin)).toEqual(['Miraflores']);
    });

    it('valida los parámetros de consulta', async () => {
      await request(http).get('/routes?page=0').set(auth()).expect(400);
      await request(http).get('/routes?pageSize=1000').set(auth()).expect(400);
      await request(http).get('/routes?active=quizas').set(auth()).expect(400);
    });
  });

  describe('GET /routes/:id', () => {
    it('devuelve la ruta', async () => {
      const created = await post({ origin: 'Detalle Origen', destination: 'Detalle Destino' });
      const res = await request(http).get(`/routes/${created.body.id}`).set(auth()).expect(200);
      expect(res.body).toMatchObject({ id: created.body.id, origin: 'Detalle Origen' });
    });

    it('responde 404 si no existe y 400 si el id no es un UUID', async () => {
      await request(http)
        .get('/routes/00000000-0000-4000-8000-000000000000')
        .set(auth())
        .expect(404);
      await request(http).get('/routes/no-es-uuid').set(auth()).expect(400);
    });
  });

  describe('PATCH /routes/:id', () => {
    it('actualiza solo los campos enviados', async () => {
      const created = await post({ origin: 'Parcial Origen', destination: 'Parcial Destino' });
      const res = await request(http)
        .patch(`/routes/${created.body.id}`)
        .set(auth())
        .send({ destination: '  Parcial   Nuevo ' })
        .expect(200);
      expect(res.body).toMatchObject({ origin: 'Parcial Origen', destination: 'Parcial Nuevo' });
    });

    it('permite guardar la misma pareja sin chocar consigo misma', async () => {
      const created = await post({ origin: 'Misma Origen', destination: 'Misma Destino' });
      await request(http)
        .patch(`/routes/${created.body.id}`)
        .set(auth())
        .send({ origin: 'MISMA ORIGEN', destination: 'Misma Destino' })
        .expect(200);
    });

    it('rechaza con 409 la pareja que pertenece a otra ruta', async () => {
      await post({ origin: 'Ajena Origen', destination: 'Ajena Destino' });
      const mine = await post({ origin: 'Propia Origen', destination: 'Propia Destino' });
      await request(http)
        .patch(`/routes/${mine.body.id}`)
        .set(auth())
        .send({ origin: 'Ajena Origen', destination: 'AJENA DESTINO' })
        .expect(409);
      // Cambiar solo el destino para que coincida con otra ruta del mismo origen.
      await request(http)
        .patch(`/routes/${mine.body.id}`)
        .set(auth())
        .send({ origin: 'Ajena Origen' })
        .expect(200);
      await request(http)
        .patch(`/routes/${mine.body.id}`)
        .set(auth())
        .send({ destination: 'Ajena Destino' })
        .expect(409);
    });

    it('rechaza que el cambio deje origen y destino iguales', async () => {
      const created = await post({ origin: 'Igual Origen', destination: 'Igual Destino' });
      await request(http)
        .patch(`/routes/${created.body.id}`)
        .set(auth())
        .send({ destination: 'igual origen' })
        .expect(400);
    });

    it('responde 404 si la ruta no existe', async () => {
      await request(http)
        .patch('/routes/00000000-0000-4000-8000-000000000000')
        .set(auth())
        .send({ active: false })
        .expect(404);
    });

    it('desactiva y reactiva, y lo registra como cambio de estado', async () => {
      const created = await post({ origin: 'Estado Origen', destination: 'Estado Destino' });
      const off = await request(http)
        .patch(`/routes/${created.body.id}`)
        .set(auth())
        .send({ active: false })
        .expect(200);
      expect(off.body.active).toBe(false);

      const on = await request(http)
        .patch(`/routes/${created.body.id}`)
        .set(auth())
        .send({ active: true })
        .expect(200);
      expect(on.body.active).toBe(true);

      const logs = await ctx.prisma.auditLog.findMany({
        where: { entity: 'Route', entityId: created.body.id, action: 'ROUTE_STATUS_CHANGED' },
      });
      expect(logs).toHaveLength(2);
      expect(logs[0].userId).toBe(admin.id);
      expect(logs[0].changes).toEqual({ fields: ['active'] });
    });

    it('una edición sin cambio de estado queda como ROUTE_UPDATED', async () => {
      const created = await post({ origin: 'Edit Origen', destination: 'Edit Destino' });
      await request(http)
        .patch(`/routes/${created.body.id}`)
        .set(auth())
        .send({ origin: 'Edit Origen Nuevo' })
        .expect(200);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'Route', entityId: created.body.id, action: 'ROUTE_UPDATED' },
      });
      expect(log?.changes).toEqual({ fields: ['origin'] });
    });

    it('rechaza campos desconocidos', async () => {
      const created = await post({ origin: 'Extra Origen', destination: 'Extra Destino' });
      await request(http)
        .patch(`/routes/${created.body.id}`)
        .set(auth())
        .send({ id: '00000000-0000-4000-8000-000000000000' })
        .expect(400);
    });
  });
});
