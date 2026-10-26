import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { BusesModule } from './buses/buses.module';
import { AuditModule } from './common/audit.service';
import { JwtAuthGuard, RolesGuard } from './auth/guards';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { RoutesModule } from './routes/routes.module';
import { SchedulesModule } from './schedules/schedules.module';
import { ShiftsModule } from './shifts/shifts.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // El .env vive en la raíz del monorepo; las variables del proceso tienen prioridad.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      // Solo para tests: permite desactivar el límite sin tocar producción.
      skipIf: () => process.env.NODE_ENV === 'test' && process.env.THROTTLE_DISABLED === 'true',
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    BusesModule,
    RoutesModule,
    SchedulesModule,
    ShiftsModule,
    AttendanceModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    // El orden importa: límite de peticiones, autenticación y luego roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
