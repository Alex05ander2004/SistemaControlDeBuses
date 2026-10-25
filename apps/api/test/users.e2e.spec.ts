import request from 'supertest';
import { createTestContext, TEST_PASSWORD, TestContext } from './helpers/test-app';

jest.setTimeout(60_000);

const NEW_PASSWORD = 'Otra-clave-segura-456';

const validUser = (overrides: Record<string, unknown> = {}) => ({
  fullName: 'Elena Paredes',
  username: 'eparedes',
  email: 'elena.paredes@airova.test',
  password: NEW_PASSWORD,
  dni: '45678912',
  birthDate: '1995-09-03',
  sex: 'FEMALE',
  phone: '987654321',
  address: 'Av. Los Olivos 123',
  role: 'WORKER',
  ...overrides,
});

describe('Usuarios (e2e)', () => {
  let ctx: TestContext;
  let http: ReturnType<TestContext['app']['getHttpServer']>;
  let adminToken: string;
  let admin: Awaited<ReturnType<TestContext['createUser']>>;

  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) =>
    request(http).post('/users').set(auth(token)).send(body);

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
      await request(http).get('/users').expect(401);
      await request(http).post('/users').send(validUser()).expect(401);
    });

    it('prohíbe a conductores y colaboradores', async () => {
      for (const role of ['DRIVER', 'WORKER'] as const) {
        const user = await ctx.createUser(role);
        const token = await ctx.tokenFor(user.username);
        await request(http).get('/users').set(auth(token)).expect(403);
        await post(
          validUser({ username: `x${role}`, email: `${role}@x.test`, dni: '11111111' }),
          token,
        ).expect(403);
        await request(http)
          .patch(`/users/${admin.id}`)
          .set(auth(token))
          .send({ fullName: 'Hack' })
          .expect(403);
      }
    });
  });

  describe('POST /users', () => {
    it('crea un usuario, normaliza usuario y correo y nunca devuelve el hash', async () => {
      const res = await post(
        validUser({ username: 'EParedes', email: 'Elena.Paredes@Airova.test' }),
      ).expect(201);

      expect(res.body).toMatchObject({
        fullName: 'Elena Paredes',
        username: 'eparedes',
        email: 'elena.paredes@airova.test',
        role: 'WORKER',
        status: 'ACTIVE',
        dni: '45678912',
        birthDate: '1995-09-03',
        sex: 'FEMALE',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);
    });

    it('el usuario creado puede iniciar sesión con su contraseña', async () => {
      await post(
        validUser({ username: 'conlogin', email: 'conlogin@x.test', dni: '22222222' }),
      ).expect(201);
      await request(http)
        .post('/auth/login')
        .send({ username: 'conlogin', password: NEW_PASSWORD })
        .expect(200);
    });

    it('registra la creación en la auditoría sin guardar la contraseña', async () => {
      const res = await post(
        validUser({ username: 'auditado', email: 'auditado@x.test', dni: '33333333' }),
      ).expect(201);
      const log = await ctx.prisma.auditLog.findFirst({
        where: { entity: 'User', entityId: res.body.id, action: 'USER_CREATED' },
      });
      expect(log?.userId).toBe(admin.id);
      expect(JSON.stringify(log?.changes)).not.toContain(NEW_PASSWORD);
    });

    it('rechaza usuario, correo o DNI repetidos con 409', async () => {
      await post(validUser({ username: 'unico', email: 'unico@x.test', dni: '44444444' })).expect(
        201,
      );

      const sameUsername = await post(
        validUser({ username: 'UNICO', email: 'otro1@x.test', dni: '55555551' }),
      ).expect(409);
      expect(sameUsername.body.message).toMatch(/usuario/i);
      const sameEmail = await post(
        validUser({ username: 'otro2', email: 'UNICO@x.test', dni: '55555552' }),
      ).expect(409);
      expect(sameEmail.body.message).toMatch(/correo/i);
      const sameDni = await post(
        validUser({ username: 'otro3', email: 'otro3@x.test', dni: '44444444' }),
      ).expect(409);
      expect(sameDni.body.message).toMatch(/DNI/i);
    });

    it('aplica la regla de edad entre 18 y 60 años', async () => {
      const year = new Date().getUTCFullYear();
      const tooYoung = await post(
        validUser({
          username: 'joven',
          email: 'joven@x.test',
          dni: '66666661',
          birthDate: `${year - 17}-01-01`,
        }),
      ).expect(400);
      expect(tooYoung.body.message).toMatch(/18 y 60/);
      await post(
        validUser({
          username: 'mayor',
          email: 'mayor@x.test',
          dni: '66666662',
          birthDate: `${year - 61}-01-01`,
        }),
      ).expect(400);
      await post(
        validUser({
          username: 'justo18',
          email: 'justo18@x.test',
          dni: '66666663',
          birthDate: `${year - 18}-01-01`,
        }),
      ).expect(201);
    });

    it('rechaza fechas imposibles', async () => {
      await post(
        validUser({
          username: 'fechamala',
          email: 'fm@x.test',
          dni: '77777771',
          birthDate: '1990-02-31',
        }),
      ).expect(400);
    });

    it('valida los campos', async () => {
      const bad: Record<string, unknown>[] = [
        { password: 'corta' },
        { email: 'no-es-correo' },
        { username: 'a b' },
        { dni: '123' },
        { phone: 'abc' },
        { role: 'SUPERUSER' },
        { sex: 'X' },
        { fullName: '' },
      ];
      for (const [index, override] of bad.entries()) {
        await post(
          validUser({
            username: `val${index}`,
            email: `val${index}@x.test`,
            dni: `8888888${index}`,
            ...override,
          }),
        ).expect(400);
      }
    });

    it('rechaza campos desconocidos', async () => {
      await post(
        validUser({
          username: 'extra',
          email: 'extra@x.test',
          dni: '99999991',
          isSuperAdmin: true,
        }),
      ).expect(400);
    });
  });

  describe('GET /users', () => {
    beforeAll(async () => {
      await post(
        validUser({
          username: 'ana.lopez',
          email: 'ana.lopez@lista.test',
          dni: '10000001',
          fullName: 'Ana López',
          role: 'DRIVER',
        }),
      );
      await post(
        validUser({
          username: 'beto.ruiz',
          email: 'beto.ruiz@lista.test',
          dni: '10000002',
          fullName: 'Beto Ruiz',
          role: 'WORKER',
          status: 'INACTIVE',
        }),
      );
    });

    it('devuelve una página con el total y sin datos sensibles', async () => {
      const res = await request(http).get('/users?page=1&pageSize=2').set(auth()).expect(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body).toMatchObject({ page: 1, pageSize: 2 });
      expect(res.body.total).toBeGreaterThan(2);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

      const second = await request(http).get('/users?page=2&pageSize=2').set(auth()).expect(200);
      expect(second.body.items[0].id).not.toBe(res.body.items[0].id);
    });

    it('busca por nombre, usuario, correo o DNI sin distinguir mayúsculas', async () => {
      for (const search of ['lópez', 'ANA.LOPEZ', 'lista.test', '10000001']) {
        const res = await request(http).get('/users').query({ search }).set(auth()).expect(200);
        expect(res.body.items.map((u: { username: string }) => u.username)).toContain('ana.lopez');
      }
    });

    it('filtra por rol y estado', async () => {
      const drivers = await request(http).get('/users?role=DRIVER').set(auth()).expect(200);
      expect(drivers.body.items.every((u: { role: string }) => u.role === 'DRIVER')).toBe(true);

      const inactive = await request(http)
        .get('/users?status=INACTIVE&search=lista.test')
        .set(auth())
        .expect(200);
      expect(inactive.body.items.map((u: { username: string }) => u.username)).toEqual([
        'beto.ruiz',
      ]);
    });

    it('valida los parámetros de consulta', async () => {
      await request(http).get('/users?page=0').set(auth()).expect(400);
      await request(http).get('/users?pageSize=1000').set(auth()).expect(400);
      await request(http).get('/users?role=NADA').set(auth()).expect(400);
    });
  });

  describe('GET /users/:id', () => {
    it('devuelve la ficha completa', async () => {
      const res = await request(http).get(`/users/${admin.id}`).set(auth()).expect(200);
      expect(res.body).toMatchObject({ id: admin.id, dni: admin.dni, role: 'ADMIN' });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    });

    it('responde 404 si no existe y 400 si el id no es un UUID', async () => {
      await request(http)
        .get('/users/00000000-0000-4000-8000-000000000000')
        .set(auth())
        .expect(404);
      await request(http).get('/users/no-es-uuid').set(auth()).expect(400);
    });
  });

  describe('PATCH /users/:id', () => {
    it('actualiza solo los campos enviados', async () => {
      const worker = await ctx.createUser('WORKER');
      const res = await request(http)
        .patch(`/users/${worker.id}`)
        .set(auth())
        .send({ fullName: 'Nombre Nuevo', phone: '912345678' })
        .expect(200);
      expect(res.body).toMatchObject({
        fullName: 'Nombre Nuevo',
        phone: '912345678',
        username: worker.username,
      });
    });

    it('permite borrar el celular y la dirección enviando texto vacío', async () => {
      const created = await post(
        validUser({ username: 'borrable', email: 'borrable@x.test', dni: '12121212' }),
      ).expect(201);
      expect(created.body.phone).toBe('987654321');

      const res = await request(http)
        .patch(`/users/${created.body.id}`)
        .set(auth())
        .send({ phone: '', address: '  ' })
        .expect(200);
      expect(res.body).toMatchObject({ phone: null, address: null });
    });

    it('permite guardar los mismos usuario, correo y DNI sin dar conflicto', async () => {
      const worker = await ctx.createUser('WORKER');
      await request(http)
        .patch(`/users/${worker.id}`)
        .set(auth())
        .send({ username: worker.username, email: worker.email, dni: worker.dni })
        .expect(200);
    });

    it('rechaza datos que pertenecen a otro usuario', async () => {
      const a = await ctx.createUser('WORKER');
      const b = await ctx.createUser('WORKER');
      await request(http).patch(`/users/${b.id}`).set(auth()).send({ email: a.email }).expect(409);
      await request(http).patch(`/users/${b.id}`).set(auth()).send({ dni: a.dni }).expect(409);
    });

    it('responde 404 si el usuario no existe', async () => {
      await request(http)
        .patch('/users/00000000-0000-4000-8000-000000000000')
        .set(auth())
        .send({ fullName: 'Nadie' })
        .expect(404);
    });

    it('restablecer la contraseña la cambia y cierra las sesiones abiertas', async () => {
      const worker = await ctx.createUser('WORKER');
      const session = await request(http)
        .post('/auth/login')
        .send({ username: worker.username, password: TEST_PASSWORD })
        .expect(200);
      const cookie = (session.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

      await request(http)
        .patch(`/users/${worker.id}`)
        .set(auth())
        .send({ password: NEW_PASSWORD })
        .expect(200);

      await request(http).post('/auth/refresh').set('Cookie', cookie).expect(401);
      await request(http)
        .post('/auth/login')
        .send({ username: worker.username, password: TEST_PASSWORD })
        .expect(401);
      await request(http)
        .post('/auth/login')
        .send({ username: worker.username, password: NEW_PASSWORD })
        .expect(200);
    });

    it('desactivar bloquea el acceso y reactivar lo devuelve', async () => {
      const worker = await ctx.createUser('WORKER');
      const session = await request(http)
        .post('/auth/login')
        .send({ username: worker.username, password: TEST_PASSWORD })
        .expect(200);
      const cookie = (session.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

      await request(http)
        .patch(`/users/${worker.id}`)
        .set(auth())
        .send({ status: 'INACTIVE' })
        .expect(200);
      await request(http).post('/auth/refresh').set('Cookie', cookie).expect(401);
      await request(http)
        .post('/auth/login')
        .send({ username: worker.username, password: TEST_PASSWORD })
        .expect(401);

      await request(http)
        .patch(`/users/${worker.id}`)
        .set(auth())
        .send({ status: 'ACTIVE' })
        .expect(200);
      await request(http)
        .post('/auth/login')
        .send({ username: worker.username, password: TEST_PASSWORD })
        .expect(200);
    });
  });

  describe('protecciones de administrador', () => {
    it('un administrador no puede desactivarse ni quitarse el rol a sí mismo', async () => {
      const self = await ctx.createUser('ADMIN');
      const token = await ctx.tokenFor(self.username);
      await request(http)
        .patch(`/users/${self.id}`)
        .set(auth(token))
        .send({ status: 'INACTIVE' })
        .expect(403);
      await request(http)
        .patch(`/users/${self.id}`)
        .set(auth(token))
        .send({ role: 'WORKER' })
        .expect(403);
    });

    it('puede editar sus otros datos', async () => {
      const self = await ctx.createUser('ADMIN');
      const token = await ctx.tokenFor(self.username);
      await request(http)
        .patch(`/users/${self.id}`)
        .set(auth(token))
        .send({ fullName: 'Admin Renombrado' })
        .expect(200);
    });

    it('un administrador puede desactivar a otro mientras quede alguno activo', async () => {
      const other = await ctx.createUser('ADMIN');
      await request(http)
        .patch(`/users/${other.id}`)
        .set(auth())
        .send({ status: 'INACTIVE' })
        .expect(200);
    });

    it('no permite dejar el sistema sin administradores activos', async () => {
      // Se aísla el escenario: solo quedan A (activo) y B (desactivado con token aún vigente).
      const a = await ctx.createUser('ADMIN');
      const b = await ctx.createUser('ADMIN');
      const tokenB = await ctx.tokenFor(b.username);
      await ctx.prisma.user.updateMany({
        where: { role: 'ADMIN', id: { notIn: [a.id, b.id] } },
        data: { status: 'INACTIVE' },
      });
      await ctx.prisma.user.update({ where: { id: b.id }, data: { status: 'INACTIVE' } });

      // B (inactivo, con token válido hasta 15 min) intenta desactivar a A, el último activo.
      const res = await request(http)
        .patch(`/users/${a.id}`)
        .set(auth(tokenB))
        .send({ status: 'INACTIVE' })
        .expect(403);
      expect(res.body.message).toMatch(/al menos un administrador activo/i);
      const stillActive = await ctx.prisma.user.findUnique({ where: { id: a.id } });
      expect(stillActive?.status).toBe('ACTIVE');
    });
  });
});
