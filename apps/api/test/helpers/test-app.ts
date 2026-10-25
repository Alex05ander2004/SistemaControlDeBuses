import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { Role, User, UserStatus } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { configureApp } from '../../src/setup';
import { startTestDb, TestDb } from './test-db';

export const TEST_PASSWORD = 'Clave-de-prueba-123';
const WEB_ORIGIN = 'http://localhost:5173';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  createUser: (
    role: Role,
    overrides?: Partial<Pick<User, 'status' | 'fullName' | 'dni'>>,
  ) => Promise<User>;
  /** Inicia sesión y devuelve el access token. */
  tokenFor: (username: string) => Promise<string>;
  close: () => Promise<void>;
}

/** PostgreSQL embebido + aplicación completa lista para pruebas e2e. */
export async function createTestContext(): Promise<TestContext> {
  const db: TestDb = await startTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.JWT_ACCESS_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';
  process.env.WEB_ORIGIN = WEB_ORIGIN;
  process.env.NODE_ENV = 'test';
  process.env.THROTTLE_DISABLED = 'true';

  // Import diferido: ConfigModule.forRoot lee el entorno al cargar AppModule.
  const { AppModule } = await import('../../src/app.module');
  const { PrismaService: Prisma } = await import('../../src/prisma/prisma.service');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, WEB_ORIGIN);
  await app.init();

  const prisma = app.get(Prisma);
  const passwordHash = await argon2.hash(TEST_PASSWORD);
  let counter = 0;

  return {
    app,
    prisma,
    async createUser(role, overrides = {}) {
      counter += 1;
      return prisma.user.create({
        data: {
          fullName: overrides.fullName ?? `Usuario ${role} ${counter}`,
          username: `${role.toLowerCase()}${counter}`,
          email: `${role.toLowerCase()}${counter}@airova.test`,
          passwordHash,
          dni: overrides.dni ?? `7000${String(counter).padStart(4, '0')}`,
          birthDate: new Date('1990-01-01'),
          sex: 'MALE',
          role,
          status: (overrides.status ?? 'ACTIVE') as UserStatus,
        },
      });
    },
    async tokenFor(username) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD })
        .expect(200);
      return res.body.accessToken as string;
    },
    async close() {
      await app.close();
      await db.stop();
    },
  };
}
