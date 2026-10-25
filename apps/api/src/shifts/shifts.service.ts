import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import type { Paginated } from '../common/pagination';
import type { Attendance, Bus, Prisma, Route, Schedule, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatTime } from '../schedules/schedules.service';
import type { CreateShiftDto, ListShiftsQuery, UpdateShiftDto } from './shifts.dto';

type Tx = Prisma.TransactionClient;

/**
 * Todas las escrituras de turnos y pasajeros pasan por este candado de la base de datos, de modo
 * que dos peticiones simultáneas no puedan sobrevender un bus ni crear choques de horario.
 */
const SHIFT_LOCK_KEY = 424242;

export const shiftInclude = {
  route: true,
  schedule: true,
  bus: true,
  driver: true,
  _count: { select: { passengers: true } },
} satisfies Prisma.ShiftInclude;
export type ShiftRecord = Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>;

export const detailInclude = {
  ...shiftInclude,
  passengers: { include: { worker: true }, orderBy: { worker: { fullName: 'asc' } } },
} satisfies Prisma.ShiftInclude;
type ShiftDetailRecord = Prisma.ShiftGetPayload<{ include: typeof detailInclude }>;

export interface ShiftDto {
  id: string;
  active: boolean;
  route: { id: string; origin: string; destination: string; active: boolean };
  schedule: { id: string; date: string; departureTime: string; arrivalTime: string };
  bus: { id: string; plate: string; seats: number };
  driver: { id: string; fullName: string };
  passengerCount: number;
}

export interface PassengerDto {
  workerId: string;
  fullName: string;
  dni: string;
  attendance: Attendance;
  markedAt: string | null;
}

export interface ShiftDetailDto extends ShiftDto {
  passengers: PassengerDto[];
}

export function toShiftDto(shift: ShiftRecord): ShiftDto {
  return {
    id: shift.id,
    active: shift.active,
    route: {
      id: shift.route.id,
      origin: shift.route.origin,
      destination: shift.route.destination,
      active: shift.route.active,
    },
    schedule: {
      id: shift.schedule.id,
      date: shift.schedule.date.toISOString().slice(0, 10),
      departureTime: formatTime(shift.schedule.departureTime),
      arrivalTime: formatTime(shift.schedule.arrivalTime),
    },
    bus: { id: shift.bus.id, plate: shift.bus.plate, seats: shift.bus.seats },
    driver: { id: shift.driver.id, fullName: shift.driver.fullName },
    passengerCount: shift._count.passengers,
  };
}

export function toShiftDetail(shift: ShiftDetailRecord): ShiftDetailDto {
  return {
    ...toShiftDto(shift),
    passengers: shift.passengers.map((passenger) => ({
      workerId: passenger.workerId,
      fullName: passenger.worker.fullName,
      dni: passenger.worker.dni,
      attendance: passenger.attendance,
      markedAt: passenger.markedAt?.toISOString() ?? null,
    })),
  };
}

/** Dos horarios chocan si son el mismo día y sus intervalos se solapan (llegar justo cuando otro sale no choca). */
function overlaps(a: Schedule, b: Schedule): boolean {
  return (
    a.date.getTime() === b.date.getTime() &&
    a.departureTime.getTime() < b.arrivalTime.getTime() &&
    b.departureTime.getTime() < a.arrivalTime.getTime()
  );
}

const slot = (schedule: Schedule) =>
  `de ${formatTime(schedule.departureTime)} a ${formatTime(schedule.arrivalTime)}`;

function parseDate(value: string, field: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} no es una fecha válida`);
  }
  return date;
}

interface Refs {
  route: Route;
  schedule: Schedule;
  bus: Bus;
  driver: User;
}
type RefName = 'route' | 'bus' | 'driver';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListShiftsQuery): Promise<Paginated<ShiftDto>> {
    const from = query.from ? parseDate(query.from, 'from') : undefined;
    const to = query.to ? parseDate(query.to, 'to') : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from no puede ser posterior a to');
    }

    const where: Prisma.ShiftWhereInput = {
      ...(query.active !== undefined && { active: query.active }),
      ...(query.routeId && { routeId: query.routeId }),
      ...(query.busId && { busId: query.busId }),
      ...(query.driverId && { driverId: query.driverId }),
      ...((from || to) && {
        schedule: { date: { ...(from && { gte: from }), ...(to && { lte: to }) } },
      }),
    };

    const [shifts, total] = await this.prisma.$transaction([
      this.prisma.shift.findMany({
        where,
        include: shiftInclude,
        orderBy: [
          { schedule: { date: 'desc' } },
          { schedule: { departureTime: 'asc' } },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.shift.count({ where }),
    ]);

    return { items: shifts.map(toShiftDto), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<ShiftDetailDto> {
    const shift = await this.prisma.shift.findUnique({ where: { id }, include: detailInclude });
    if (!shift) throw new NotFoundException('Turno no encontrado');
    return toShiftDetail(shift);
  }

  async create(dto: CreateShiftDto, actorId: string): Promise<ShiftDto> {
    const shift = await this.locked(async (tx) => {
      const refs = await this.loadRefs(tx, dto);
      this.assertUsable(refs, ['route', 'bus', 'driver']);
      const active = dto.active ?? true;
      if (active) await this.assertNoConflicts(tx, refs);

      return tx.shift.create({
        data: {
          routeId: dto.routeId,
          scheduleId: dto.scheduleId,
          busId: dto.busId,
          driverId: dto.driverId,
          active,
        },
        include: shiftInclude,
      });
    });

    await this.audit.record({
      userId: actorId,
      action: 'SHIFT_CREATED',
      entity: 'Shift',
      entityId: shift.id,
      changes: { scheduleId: dto.scheduleId, busId: dto.busId, driverId: dto.driverId },
    });
    return toShiftDto(shift);
  }

  async update(id: string, dto: UpdateShiftDto, actorId: string): Promise<ShiftDto> {
    const { shift, statusChanged } = await this.locked(async (tx) => {
      const current = await tx.shift.findUnique({
        where: { id },
        include: { passengers: { select: { workerId: true } } },
      });
      if (!current) throw new NotFoundException('Turno no encontrado');

      const next = {
        routeId: dto.routeId ?? current.routeId,
        scheduleId: dto.scheduleId ?? current.scheduleId,
        busId: dto.busId ?? current.busId,
        driverId: dto.driverId ?? current.driverId,
        active: dto.active ?? current.active,
      };
      const reactivating = next.active && !current.active;
      const scheduleChanged = next.scheduleId !== current.scheduleId;
      const busChanged = next.busId !== current.busId;
      const driverChanged = next.driverId !== current.driverId;

      // Solo se exige que estén activos los recursos que cambian (o todos al reactivar el turno).
      const toCheck: RefName[] = [];
      if (reactivating || next.routeId !== current.routeId) toCheck.push('route');
      if (reactivating || busChanged) toCheck.push('bus');
      if (reactivating || driverChanged) toCheck.push('driver');

      const refs = await this.loadRefs(tx, next);
      this.assertUsable(refs, toCheck);

      if ((busChanged || reactivating) && current.passengers.length > refs.bus.seats) {
        throw new ConflictException(
          `El bus ${refs.bus.plate} tiene ${refs.bus.seats} asientos y el turno ya tiene ${current.passengers.length} pasajeros`,
        );
      }

      if (next.active && (reactivating || scheduleChanged || busChanged || driverChanged)) {
        await this.assertNoConflicts(tx, refs, id);
        if (reactivating || scheduleChanged) {
          for (const passenger of current.passengers) {
            await this.assertWorkerFree(tx, passenger.workerId, refs.schedule, id);
          }
        }
      }

      const updated = await tx.shift.update({ where: { id }, data: next, include: shiftInclude });
      return { shift: updated, statusChanged: next.active !== current.active };
    });

    await this.audit.record({
      userId: actorId,
      action: statusChanged ? 'SHIFT_STATUS_CHANGED' : 'SHIFT_UPDATED',
      entity: 'Shift',
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });
    return toShiftDto(shift);
  }

  async addPassengers(id: string, workerIds: string[], actorId: string): Promise<ShiftDetailDto> {
    await this.locked(async (tx) => {
      const shift = await tx.shift.findUnique({
        where: { id },
        include: { bus: true, schedule: true, passengers: { select: { workerId: true } } },
      });
      if (!shift) throw new NotFoundException('Turno no encontrado');
      if (!shift.active) {
        throw new ConflictException('El turno está inactivo: actívalo para asignar pasajeros');
      }

      const workers = await tx.user.findMany({ where: { id: { in: workerIds } } });
      if (workers.length !== workerIds.length) {
        throw new BadRequestException('Alguno de los pasajeros indicados no existe');
      }
      const notWorkers = workers.filter((worker) => worker.role !== 'WORKER');
      if (notWorkers.length > 0) {
        throw new BadRequestException(
          `Solo se pueden asignar colaboradores: ${notWorkers.map((u) => u.fullName).join(', ')}`,
        );
      }
      const inactive = workers.filter((worker) => worker.status !== 'ACTIVE');
      if (inactive.length > 0) {
        throw new BadRequestException(
          `Hay colaboradores inactivos: ${inactive.map((u) => u.fullName).join(', ')}`,
        );
      }

      const assigned = new Set(shift.passengers.map((passenger) => passenger.workerId));
      const repeated = workers.filter((worker) => assigned.has(worker.id));
      if (repeated.length > 0) {
        throw new ConflictException(
          `Ya están asignados a este turno: ${repeated.map((u) => u.fullName).join(', ')}`,
        );
      }

      const total = shift.passengers.length + workers.length;
      if (total > shift.bus.seats) {
        const free = shift.bus.seats - shift.passengers.length;
        throw new ConflictException(
          `Capacidad excedida: el bus ${shift.bus.plate} tiene ${shift.bus.seats} asientos y ${
            free === 0 ? 'está lleno' : `solo quedan ${free} libres`
          }`,
        );
      }

      for (const worker of workers) {
        await this.assertWorkerFree(tx, worker.id, shift.schedule, id, worker.fullName);
      }

      await tx.shiftPassenger.createMany({
        data: workers.map((worker) => ({ shiftId: id, workerId: worker.id })),
      });
    });

    await this.audit.record({
      userId: actorId,
      action: 'SHIFT_PASSENGERS_ADDED',
      entity: 'Shift',
      entityId: id,
      changes: { count: workerIds.length },
    });
    return this.get(id);
  }

  async removePassenger(id: string, workerId: string, actorId: string): Promise<void> {
    await this.locked(async (tx) => {
      const passenger = await tx.shiftPassenger.findUnique({
        where: { shiftId_workerId: { shiftId: id, workerId } },
      });
      if (!passenger) throw new NotFoundException('El pasajero no está asignado a este turno');
      if (passenger.attendance !== 'PENDING') {
        throw new ConflictException('No se puede quitar: ya tiene la asistencia registrada');
      }
      await tx.shiftPassenger.delete({ where: { id: passenger.id } });
    });

    await this.audit.record({
      userId: actorId,
      action: 'SHIFT_PASSENGER_REMOVED',
      entity: 'Shift',
      entityId: id,
      changes: { workerId },
    });
  }

  private locked<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${SHIFT_LOCK_KEY})`);
      return fn(tx);
    });
  }

  private async loadRefs(
    tx: Tx,
    ids: { routeId: string; scheduleId: string; busId: string; driverId: string },
  ): Promise<Refs> {
    const [route, schedule, bus, driver] = await Promise.all([
      tx.route.findUnique({ where: { id: ids.routeId } }),
      tx.schedule.findUnique({ where: { id: ids.scheduleId } }),
      tx.bus.findUnique({ where: { id: ids.busId } }),
      tx.user.findUnique({ where: { id: ids.driverId } }),
    ]);
    if (!route) throw new BadRequestException('La ruta indicada no existe');
    if (!schedule) throw new BadRequestException('El horario indicado no existe');
    if (!bus) throw new BadRequestException('El bus indicado no existe');
    if (!driver) throw new BadRequestException('El conductor indicado no existe');
    return { route, schedule, bus, driver };
  }

  private assertUsable(refs: Refs, names: RefName[]) {
    if (names.includes('route') && !refs.route.active) {
      throw new ConflictException('La ruta está inactiva');
    }
    if (names.includes('bus') && refs.bus.status !== 'ACTIVE') {
      throw new ConflictException(`El bus ${refs.bus.plate} no está activo`);
    }
    if (names.includes('driver')) {
      if (refs.driver.role !== 'DRIVER') {
        throw new BadRequestException('El chofer debe tener el rol Conductor');
      }
      if (refs.driver.status !== 'ACTIVE') {
        throw new ConflictException(`El conductor ${refs.driver.fullName} está inactivo`);
      }
    }
  }

  /** El bus y el conductor no pueden estar en dos turnos activos que se solapen. */
  private async assertNoConflicts(tx: Tx, refs: Refs, excludeShiftId?: string) {
    const busClash = await this.findOverlap(
      tx,
      { busId: refs.bus.id },
      refs.schedule,
      excludeShiftId,
    );
    if (busClash) {
      throw new ConflictException(
        `El bus ${refs.bus.plate} ya tiene un turno ese día ${slot(busClash)}`,
      );
    }
    const driverClash = await this.findOverlap(
      tx,
      { driverId: refs.driver.id },
      refs.schedule,
      excludeShiftId,
    );
    if (driverClash) {
      throw new ConflictException(
        `El conductor ${refs.driver.fullName} ya tiene un turno ese día ${slot(driverClash)}`,
      );
    }
  }

  private async assertWorkerFree(
    tx: Tx,
    workerId: string,
    schedule: Schedule,
    excludeShiftId: string,
    knownName?: string,
  ) {
    const clash = await this.findOverlap(tx, { workerId }, schedule, excludeShiftId);
    if (!clash) return;
    const name =
      knownName ??
      (await tx.user.findUnique({ where: { id: workerId } }))?.fullName ??
      'Un pasajero';
    throw new ConflictException(`${name} ya está en otro turno ese día ${slot(clash)}`);
  }

  private async findOverlap(
    tx: Tx,
    who: { busId: string } | { driverId: string } | { workerId: string },
    schedule: Schedule,
    excludeShiftId?: string,
  ): Promise<Schedule | null> {
    const where: Prisma.ShiftWhereInput = {
      active: true,
      schedule: { date: schedule.date },
      ...(excludeShiftId && { id: { not: excludeShiftId } }),
      ...('busId' in who && { busId: who.busId }),
      ...('driverId' in who && { driverId: who.driverId }),
      ...('workerId' in who && { passengers: { some: { workerId: who.workerId } } }),
    };
    const shifts = await tx.shift.findMany({ where, include: { schedule: true } });
    return shifts.map((shift) => shift.schedule).find((other) => overlaps(other, schedule)) ?? null;
  }
}
