import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../common/audit.service';
import { dateOnly, todayIn } from '../common/dates';
import type { Paginated } from '../common/pagination';
import type { Env } from '../config/env';
import type { Attendance, Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  detailInclude,
  shiftInclude,
  toShiftDetail,
  toShiftDto,
  type ShiftDetailDto,
  type ShiftDto,
} from '../shifts/shifts.service';
import type { MyShiftsQuery } from './attendance.dto';

export interface Actor {
  id: string;
  role: Role;
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  pending: number;
}

/** Turno visto por su conductor: con el avance de la asistencia. */
export interface DriverShiftDto extends ShiftDto {
  summary: AttendanceSummary;
  /** Falso mientras la fecha del turno no haya llegado. */
  canMark: boolean;
  /** El turno es hoy, según la zona horaria de la app. */
  isToday: boolean;
}

/** Turno visto por un colaborador: solo su propia asistencia. */
export interface WorkerShiftDto extends ShiftDto {
  isToday: boolean;
  myAttendance: Attendance;
  markedAt: string | null;
}

export type MyShiftDto = DriverShiftDto | WorkerShiftDto;
export type DriverShiftDetailDto = ShiftDetailDto &
  Pick<DriverShiftDto, 'summary' | 'canMark' | 'isToday'>;

export interface MarkedPassengerDto {
  workerId: string;
  fullName: string;
  dni: string;
  attendance: Attendance;
  markedAt: string | null;
}

export interface OverviewItemDto extends ShiftDto {
  summary: AttendanceSummary;
}

export function summarize(passengers: { attendance: Attendance }[]): AttendanceSummary {
  const summary = { present: 0, absent: 0, pending: 0 };
  for (const { attendance } of passengers) {
    if (attendance === 'PRESENT') summary.present += 1;
    else if (attendance === 'ABSENT') summary.absent += 1;
    else summary.pending += 1;
  }
  return summary;
}

function parseDate(value: string, field: string): Date {
  const date = dateOnly(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} no es una fecha válida`);
  }
  return date;
}

const byDeparture = [
  { schedule: { date: 'asc' } },
  { schedule: { departureTime: 'asc' } },
  { id: 'asc' },
] satisfies Prisma.ShiftOrderByWithRelationInput[];

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private today(): string {
    return todayIn(this.config.get('APP_TIMEZONE', { infer: true }));
  }

  private canMark(shiftDate: Date, today: string): boolean {
    return shiftDate.toISOString().slice(0, 10) <= today;
  }

  private isToday(shiftDate: Date, today: string): boolean {
    return shiftDate.toISOString().slice(0, 10) === today;
  }

  /** Mis turnos: los que conduzco (DRIVER) o en los que viajo (WORKER), desde hoy por defecto. */
  async myShifts(actor: Actor, query: MyShiftsQuery): Promise<Paginated<MyShiftDto>> {
    const today = this.today();
    const from = parseDate(query.from ?? today, 'from');
    const to = query.to ? parseDate(query.to, 'to') : undefined;
    if (to && from > to) throw new BadRequestException('from no puede ser posterior a to');

    const where: Prisma.ShiftWhereInput = {
      active: true,
      schedule: { date: { gte: from, ...(to && { lte: to }) } },
      ...(actor.role === 'DRIVER'
        ? { driverId: actor.id }
        : { passengers: { some: { workerId: actor.id } } }),
    };
    const paging = { skip: (query.page - 1) * query.pageSize, take: query.pageSize };

    if (actor.role === 'DRIVER') {
      const [shifts, total] = await this.prisma.$transaction([
        this.prisma.shift.findMany({
          where,
          include: { ...shiftInclude, passengers: { select: { attendance: true } } },
          orderBy: byDeparture,
          ...paging,
        }),
        this.prisma.shift.count({ where }),
      ]);
      const items = shifts.map((shift) => ({
        ...toShiftDto(shift),
        summary: summarize(shift.passengers),
        canMark: this.canMark(shift.schedule.date, today),
        isToday: this.isToday(shift.schedule.date, today),
      }));
      return { items, total, page: query.page, pageSize: query.pageSize };
    }

    const [shifts, total] = await this.prisma.$transaction([
      this.prisma.shift.findMany({
        where,
        include: {
          ...shiftInclude,
          passengers: {
            where: { workerId: actor.id },
            select: { attendance: true, markedAt: true },
          },
        },
        orderBy: byDeparture,
        ...paging,
      }),
      this.prisma.shift.count({ where }),
    ]);
    const items = shifts.map((shift) => ({
      ...toShiftDto(shift),
      isToday: this.isToday(shift.schedule.date, today),
      myAttendance: shift.passengers[0]?.attendance ?? ('PENDING' as const),
      markedAt: shift.passengers[0]?.markedAt?.toISOString() ?? null,
    }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Detalle de un turno propio. El conductor ve el manifiesto; el colaborador, solo lo suyo. */
  async myShift(actor: Actor, id: string): Promise<DriverShiftDetailDto | WorkerShiftDto> {
    const today = this.today();

    if (actor.role === 'DRIVER') {
      const shift = await this.prisma.shift.findFirst({
        where: { id, driverId: actor.id, active: true },
        include: detailInclude,
      });
      if (!shift) throw new NotFoundException('Turno no encontrado');
      return {
        ...toShiftDetail(shift),
        summary: summarize(shift.passengers),
        canMark: this.canMark(shift.schedule.date, today),
        isToday: this.isToday(shift.schedule.date, today),
      };
    }

    const shift = await this.prisma.shift.findFirst({
      where: { id, active: true, passengers: { some: { workerId: actor.id } } },
      include: {
        ...shiftInclude,
        passengers: { where: { workerId: actor.id }, select: { attendance: true, markedAt: true } },
      },
    });
    if (!shift) throw new NotFoundException('Turno no encontrado');
    return {
      ...toShiftDto(shift),
      isToday: this.isToday(shift.schedule.date, today),
      myAttendance: shift.passengers[0]?.attendance ?? 'PENDING',
      markedAt: shift.passengers[0]?.markedAt?.toISOString() ?? null,
    };
  }

  /**
   * Marca (o deshace con PENDING) la asistencia de un pasajero. El conductor solo puede hacerlo en
   * sus turnos y desde el día del turno; el administrador puede corregir cuando quiera.
   */
  async mark(
    actor: Actor,
    shiftId: string,
    workerId: string,
    attendance: Attendance,
  ): Promise<MarkedPassengerDto> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { schedule: true },
    });
    // A un conductor ajeno no se le revela que el turno existe.
    if (!shift || (actor.role === 'DRIVER' && shift.driverId !== actor.id)) {
      throw new NotFoundException('Turno no encontrado');
    }
    if (!shift.active) {
      throw new ConflictException('El turno está inactivo: no se puede registrar asistencia');
    }
    if (actor.role === 'DRIVER' && !this.canMark(shift.schedule.date, this.today())) {
      const date = shift.schedule.date.toISOString().slice(0, 10);
      throw new ConflictException(
        `Todavía no se puede marcar la asistencia: el turno es el ${date}`,
      );
    }

    const passenger = await this.prisma.shiftPassenger.findUnique({
      where: { shiftId_workerId: { shiftId, workerId } },
    });
    if (!passenger) throw new NotFoundException('El pasajero no está asignado a este turno');

    const pending = attendance === 'PENDING';
    const updated = await this.prisma.shiftPassenger.update({
      where: { id: passenger.id },
      data: {
        attendance,
        markedAt: pending ? null : new Date(),
        markedById: pending ? null : actor.id,
      },
      include: { worker: true },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'ATTENDANCE_MARKED',
      entity: 'Shift',
      entityId: shiftId,
      changes: { workerId, attendance },
    });

    return {
      workerId: updated.workerId,
      fullName: updated.worker.fullName,
      dni: updated.worker.dni,
      attendance: updated.attendance,
      markedAt: updated.markedAt?.toISOString() ?? null,
    };
  }

  /** Resumen de asistencia de todos los turnos activos de un día (hoy por defecto). */
  async overview(date?: string): Promise<{ date: string; items: OverviewItemDto[] }> {
    const day = date ?? this.today();
    const shifts = await this.prisma.shift.findMany({
      where: { active: true, schedule: { date: parseDate(day, 'date') } },
      include: { ...shiftInclude, passengers: { select: { attendance: true } } },
      orderBy: byDeparture,
    });
    return {
      date: day,
      items: shifts.map((shift) => ({
        ...toShiftDto(shift),
        summary: summarize(shift.passengers),
      })),
    };
  }
}
