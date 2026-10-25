import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { Role, UserStatus } from '../src/generated/prisma/client';
import { hashToken } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/setup';
import { startTestDb, TestDb } from './helpers/test-db';

jest.setTimeout(60_000);

const PASSWORD = 'Clave-de-prueba-123';
const WEB_ORIGIN = 'http://localhost:5173';

let testDb: TestDb;

async function createApp(): Promise<INestApplication> {
  // Import diferido: ConfigModule.forRoot lee el entorno al cargar AppModule.
  const { AppModule } = await import('../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, WEB_ORIGIN);
  await app.init();
  return app;
}

function refreshCookie(res: request.Response): string {
  const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const cookie = cookies.find((value) => value.startsWith('refresh_token='));
  if (!cookie) throw new Error('La respuesta no trae la cookie refresh_token');
  return cookie;
}

const cookieValue = (setCookie: string) => setCookie.split(';')[0];

beforeAll(async () => {
  testDb = await startTestDb();
  process.env.DATABASE_URL = testDb.url;
  process.env.JWT_ACCESS_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';
  process.env.WEB_ORIGIN = WEB_ORIGIN;
  process.env.NODE_ENV = 'test';
  process.env.THROTTLE_DISABLED = 'true';
});

afterAll(async () => {
  await testDb.stop();
});

describe('Auth y RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordHash: string;
  let counter = 0;

  async function createUser(role: Role, status: UserStatus = 'ACTIVE') {
    counter += 1;
    return prisma.user.create({
      data: {
        fullName: `Usuario ${role} ${counter}`,
        username: `${role.toLowerCase()}${counter}`,
        email: `${role.toLowerCase()}${counter}@airova.test`,
        passwordHash,
        dni: `9000${String(counter).padStart(4, '0')}`,
        birthDate: new Date('1990-01-01'),
        sex: 'MALE',
        role,
        status,
      },
    });
  }

  const login = (username: string, password = PASSWORD) =>
    request(app.getHttpServer()).post('/auth/login').send({ username, password });

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    passwordHash = await argon2.hash(PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde ok con la base de datos disponible', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  describe('POST /auth/login', () => {
    it('devuelve access token, usuario sin hash y cookie httpOnly de refresh', async () => {
      const user = await createUser('ADMIN');
      const res = await login(user.username).expect(200);

      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user).toMatchObject({ id: user.id, role: 'ADMIN', username: user.username });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|argon2/);

      const cookie = refreshCookie(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\/auth/);
    });

    it('acepta el correo en lugar del usuario, sin distinguir mayúsculas', async () => {
      const user = await createUser('WORKER');
      await login(user.email.toUpperCase()).expect(200);
    });

    it('da el mismo error para usuario inexistente y contraseña errónea', async () => {
      const user = await createUser('WORKER');
      const wrongPassword = await login(user.username, 'otra-clave-incorrecta').expect(401);
      const unknownUser = await login('no-existe', PASSWORD).expect(401);
      expect(unknownUser.body.message).toBe(wrongPassword.body.message);
    });

    it('rechaza a un usuario inactivo', async () => {
      const user = await createUser('DRIVER', 'INACTIVE');
      await login(user.username).expect(401);
    });

    it('rechaza campos desconocidos y cuerpos incompletos', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'x', password: 'y', role: 'ADMIN' })
        .expect(400);
      await request(app.getHttpServer()).post('/auth/login').send({ username: 'x' }).expect(400);
    });

    it('limita los intentos: tras 5 en un minuto responde 429', async () => {
      process.env.THROTTLE_DISABLED = 'false';
      try {
        const statuses: number[] = [];
        for (let attempt = 0; attempt < 7; attempt += 1) {
          const res = await login('nadie', 'x');
          statuses.push(res.status);
        }
        expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
        expect(statuses.slice(5)).toEqual([429, 429]);
      } finally {
        process.env.THROTTLE_DISABLED = 'true';
      }
    });
  });

  describe('RBAC', () => {
    it('GET /users sin token responde 401', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('GET /users con token manipulado responde 401', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', 'Bearer abc.def.ghi')
        .expect(401);
    });

    it('GET /users con rol DRIVER o WORKER responde 403', async () => {
      for (const role of ['DRIVER', 'WORKER'] as const) {
        const user = await createUser(role);
        const { body } = await login(user.username).expect(200);
        await request(app.getHttpServer())
          .get('/users')
          .set('Authorization', `Bearer ${body.accessToken}`)
          .expect(403);
      }
    });

    it('GET /users con rol ADMIN lista usuarios sin exponer el hash', async () => {
      const admin = await createUser('ADMIN');
      const { body } = await login(admin.username).expect(200);
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    });

    it('GET /auth/me devuelve el usuario de la sesión', async () => {
      const worker = await createUser('WORKER');
      const { body } = await login(worker.username).expect(200);
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(res.body).toMatchObject({ id: worker.id, role: 'WORKER' });
    });
  });

  describe('refresh y logout', () => {
    it('rota el refresh token y emite un access token nuevo', async () => {
      const user = await createUser('DRIVER');
      const first = cookieValue(refreshCookie(await login(user.username).expect(200)));

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', first)
        .expect(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user.id).toBe(user.id);
      expect(cookieValue(refreshCookie(res))).not.toBe(first);
    });

    it('tolera un refresh simultáneo con el token recién rotado sin cerrar la sesión', async () => {
      const user = await createUser('DRIVER');
      const first = cookieValue(refreshCookie(await login(user.username).expect(200)));
      const rotated = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', first)
        .expect(200);
      const second = cookieValue(refreshCookie(rotated));

      // Reutilización dentro del margen de gracia: se rechaza, no se borra la cookie ni se revoca el resto.
      const race = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', first)
        .expect(401);
      expect(race.headers['set-cookie']).toBeUndefined();
      await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', second).expect(200);
    });

    it('detecta la reutilización tardía de un token rotado y cierra todas las sesiones', async () => {
      const user = await createUser('DRIVER');
      const first = cookieValue(refreshCookie(await login(user.username).expect(200)));
      const rotated = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', first)
        .expect(200);
      const second = cookieValue(refreshCookie(rotated));

      // Simula que la rotación ocurrió hace un minuto (fuera del margen de gracia).
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(first.split('=')[1]) },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', first).expect(401);
      // El token legítimo más reciente también queda revocado.
      await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', second).expect(401);
    });

    it('rechaza el refresh sin cookie', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('logout revoca el refresh token y limpia la cookie', async () => {
      const user = await createUser('WORKER');
      const cookie = cookieValue(refreshCookie(await login(user.username).expect(200)));

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
      expect(refreshCookie(res)).toMatch(/refresh_token=;/);

      await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('no renueva la sesión de un usuario desactivado', async () => {
      const user = await createUser('WORKER');
      const cookie = cookieValue(refreshCookie(await login(user.username).expect(200)));
      await prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVE' } });

      await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie).expect(401);
    });
  });
});
