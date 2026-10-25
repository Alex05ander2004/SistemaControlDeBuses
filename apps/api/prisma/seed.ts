import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';

config({ path: path.resolve(__dirname, '../../../.env') });

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta DATABASE_URL');

  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD es obligatoria (mínimo ${MIN_PASSWORD_LENGTH} caracteres)`,
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const passwordHash = await argon2.hash(password);

    // Si el usuario ya existe no se toca (no se pisa una contraseña cambiada).
    const upsertUser = (data: Parameters<typeof prisma.user.create>[0]['data']) =>
      prisma.user.upsert({ where: { username: data.username }, update: {}, create: data });

    const admin = await upsertUser({
      fullName: 'Administrador AIROVA',
      username: process.env.SEED_ADMIN_USERNAME ?? 'admin',
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@airova.local',
      passwordHash,
      dni: '00000000',
      birthDate: new Date('1990-01-01'),
      sex: 'MALE',
      role: 'ADMIN',
    });
    console.log(`Administrador listo: ${admin.username}`);

    if (process.env.SEED_SAMPLE_DATA !== 'true') return;

    const driver = await upsertUser({
      fullName: 'Mario Silva',
      username: 'conductor',
      email: 'conductor@airova.local',
      passwordHash,
      dni: '10000001',
      birthDate: new Date('1985-05-12'),
      sex: 'MALE',
      phone: '900000001',
      role: 'DRIVER',
    });
    const worker = await upsertUser({
      fullName: 'Elena Paredes',
      username: 'colaborador',
      email: 'colaborador@airova.local',
      passwordHash,
      dni: '10000002',
      birthDate: new Date('1995-09-03'),
      sex: 'FEMALE',
      phone: '900000002',
      role: 'WORKER',
    });

    const bus = await prisma.bus.upsert({
      where: { plate: 'ABC-123' },
      update: {},
      create: { plate: 'ABC-123', brand: 'Mercedes-Benz', model: 'OF 1721', seats: 40 },
    });
    await prisma.bus.upsert({
      where: { plate: 'BCF-490' },
      update: {},
      create: {
        plate: 'BCF-490',
        brand: 'Volvo',
        model: 'B270F',
        seats: 45,
        status: 'MAINTENANCE',
      },
    });

    const route =
      (await prisma.route.findFirst({ where: { origin: 'Los Olivos' } })) ??
      (await prisma.route.create({
        data: { origin: 'Los Olivos', destination: 'Planta Central' },
      }));
    const schedule =
      (await prisma.schedule.findFirst({ where: { date: new Date('2026-11-02') } })) ??
      (await prisma.schedule.create({
        data: {
          date: new Date('2026-11-02'),
          departureTime: new Date('1970-01-01T06:30:00Z'),
          arrivalTime: new Date('1970-01-01T07:30:00Z'),
        },
      }));

    const shift =
      (await prisma.shift.findFirst({
        where: { routeId: route.id, scheduleId: schedule.id, busId: bus.id },
      })) ??
      (await prisma.shift.create({
        data: { routeId: route.id, scheduleId: schedule.id, busId: bus.id, driverId: driver.id },
      }));
    await prisma.shiftPassenger.upsert({
      where: { shiftId_workerId: { shiftId: shift.id, workerId: worker.id } },
      update: {},
      create: { shiftId: shift.id, workerId: worker.id },
    });
    console.log('Datos de ejemplo cargados');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
