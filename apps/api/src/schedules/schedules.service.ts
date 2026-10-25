import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import type { Paginated } from '../common/pagination';
import type { Prisma, Schedule } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateScheduleDto, ListSchedulesQuery, UpdateScheduleDto } from './schedules.dto';

/** Horario tal como lo expone la API: fecha AAAA-MM-DD y horas HH:mm. */
export interface ScheduleDto {
  id: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  createdAt: string;
}

export function toScheduleDto(schedule: Schedule): ScheduleDto {
  return {
    id: schedule.id,
    date: schedule.date.toISOString().slice(0, 10),
    departureTime: formatTime(schedule.departureTime),
    arrivalTime: formatTime(schedule.arrivalTime),
    createdAt: schedule.createdAt.toISOString(),
  };
}

/** Las columnas Time(0) se guardan como Date en 1970-01-01 (UTC). */
export function timeToDate(time: string): Date {
  return new Date(`1970-01-01T${time}:00.000Z`);
}

export function formatTime(value: Date): string {
  return value.toISOString().slice(11, 16);
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function parseDate(value: string, field: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} no es una fecha válida`);
  }
  return date;
}

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListSchedulesQuery): Promise<Paginated<ScheduleDto>> {
    const from = query.from ? parseDate(query.from, 'from') : undefined;
    const to = query.to ? parseDate(query.to, 'to') : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from no puede ser posterior a to');
    }

    const where: Prisma.ScheduleWhereInput = {
      ...((from || to) && { date: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.schedule.findMany({
        where,
        orderBy: [{ date: 'desc' }, { departureTime: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.schedule.count({ where }),
    ]);

    return { items: items.map(toScheduleDto), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<ScheduleDto> {
    return toScheduleDto(await this.findOrFail(id));
  }

  async create(dto: CreateScheduleDto, actorId: string): Promise<ScheduleDto> {
    const date = parseDate(dto.date, 'date');
    this.assertOrder(dto.departureTime, dto.arrivalTime);
    const departureTime = timeToDate(dto.departureTime);
    const arrivalTime = timeToDate(dto.arrivalTime);
    await this.assertUnique(date, departureTime, arrivalTime);

    const schedule = await this.prisma.schedule.create({
      data: { date, departureTime, arrivalTime },
    });

    await this.audit.record({
      userId: actorId,
      action: 'SCHEDULE_CREATED',
      entity: 'Schedule',
      entityId: schedule.id,
      changes: { date: dto.date, departureTime: dto.departureTime, arrivalTime: dto.arrivalTime },
    });
    return toScheduleDto(schedule);
  }

  async update(id: string, dto: UpdateScheduleDto, actorId: string): Promise<ScheduleDto> {
    const current = await this.findOrFail(id);

    const date = dto.date !== undefined ? parseDate(dto.date, 'date') : current.date;
    const departure = dto.departureTime ?? formatTime(current.departureTime);
    const arrival = dto.arrivalTime ?? formatTime(current.arrivalTime);
    this.assertOrder(departure, arrival);

    const departureTime = timeToDate(departure);
    const arrivalTime = timeToDate(arrival);
    await this.assertUnique(date, departureTime, arrivalTime, id);

    const changesSlot =
      date.getTime() !== current.date.getTime() ||
      departureTime.getTime() !== current.departureTime.getTime() ||
      arrivalTime.getTime() !== current.arrivalTime.getTime();
    if (changesSlot) {
      const shifts = await this.prisma.shift.count({ where: { scheduleId: id } });
      if (shifts > 0) {
        throw new ConflictException(
          `No se puede modificar: el horario está asignado a ${shifts} ${shifts === 1 ? 'turno' : 'turnos'}. Reasigna o desactiva esos turnos primero`,
        );
      }
    }

    const data: Prisma.ScheduleUpdateInput = {
      ...(dto.date !== undefined && { date }),
      ...(dto.departureTime !== undefined && { departureTime }),
      ...(dto.arrivalTime !== undefined && { arrivalTime }),
    };
    const schedule = await this.prisma.schedule.update({ where: { id }, data });

    await this.audit.record({
      userId: actorId,
      action: 'SCHEDULE_UPDATED',
      entity: 'Schedule',
      entityId: id,
      changes: { fields: Object.keys(data) },
    });
    return toScheduleDto(schedule);
  }

  /** Un horario libre se puede borrar; si algún turno lo usa se rechaza con 409. */
  async remove(id: string, actorId: string): Promise<void> {
    const schedule = await this.findOrFail(id);

    const shifts = await this.prisma.shift.count({ where: { scheduleId: id } });
    if (shifts > 0) {
      throw new ConflictException(
        `No se puede eliminar: el horario está asignado a ${shifts} ${shifts === 1 ? 'turno' : 'turnos'}`,
      );
    }

    await this.prisma.schedule.delete({ where: { id } });
    await this.audit.record({
      userId: actorId,
      action: 'SCHEDULE_DELETED',
      entity: 'Schedule',
      entityId: id,
      changes: {
        date: schedule.date.toISOString().slice(0, 10),
        departureTime: formatTime(schedule.departureTime),
        arrivalTime: formatTime(schedule.arrivalTime),
      },
    });
  }

  private async findOrFail(id: string): Promise<Schedule> {
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException('Horario no encontrado');
    return schedule;
  }

  /** Los viajes que cruzan la medianoche quedan fuera de alcance: la llegada es el mismo día. */
  private assertOrder(departure: string, arrival: string) {
    if (toMinutes(arrival) <= toMinutes(departure)) {
      throw new BadRequestException('La hora de llegada debe ser posterior a la de salida');
    }
  }

  private async assertUnique(
    date: Date,
    departureTime: Date,
    arrivalTime: Date,
    excludeId?: string,
  ) {
    const clash = await this.prisma.schedule.findFirst({
      where: { date, departureTime, arrivalTime, ...(excludeId && { id: { not: excludeId } }) },
    });
    if (clash) {
      throw new ConflictException('Ya existe un horario con la misma fecha, salida y llegada');
    }
  }
}
