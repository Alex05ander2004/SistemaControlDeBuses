import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import type { Paginated } from '../common/pagination';
import type { Bus, BusStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBusDto, ListBusesQuery, UpdateBusDto } from './buses.dto';

export interface BusDto {
  id: string;
  plate: string;
  brand: string;
  model: string;
  seats: number;
  status: BusStatus;
  createdAt: string;
}

export function toBusDto(bus: Bus): BusDto {
  return {
    id: bus.id,
    plate: bus.plate,
    brand: bus.brand,
    model: bus.model,
    seats: bus.seats,
    status: bus.status,
    createdAt: bus.createdAt.toISOString(),
  };
}

@Injectable()
export class BusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListBusesQuery): Promise<Paginated<BusDto>> {
    const where: Prisma.BusWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { plate: { contains: query.search, mode: 'insensitive' } },
          { brand: { contains: query.search, mode: 'insensitive' } },
          { model: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [buses, total] = await this.prisma.$transaction([
      this.prisma.bus.findMany({
        where,
        orderBy: [{ plate: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.bus.count({ where }),
    ]);

    return { items: buses.map(toBusDto), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<BusDto> {
    return toBusDto(await this.findOrFail(id));
  }

  async create(dto: CreateBusDto, actorId: string): Promise<BusDto> {
    await this.assertPlateFree(dto.plate);

    const bus = await this.prisma.bus.create({
      data: {
        plate: dto.plate,
        brand: dto.brand,
        model: dto.model,
        seats: dto.seats,
        status: dto.status ?? 'ACTIVE',
      },
    });

    await this.audit.record({
      userId: actorId,
      action: 'BUS_CREATED',
      entity: 'Bus',
      entityId: bus.id,
      changes: { plate: bus.plate },
    });
    return toBusDto(bus);
  }

  async update(id: string, dto: UpdateBusDto, actorId: string): Promise<BusDto> {
    const current = await this.findOrFail(id);
    if (dto.plate !== undefined) await this.assertPlateFree(dto.plate, id);
    await this.assertShiftsAllow(id, current, dto);

    const data: Prisma.BusUpdateInput = {
      ...(dto.plate !== undefined && { plate: dto.plate }),
      ...(dto.brand !== undefined && { brand: dto.brand }),
      ...(dto.model !== undefined && { model: dto.model }),
      ...(dto.seats !== undefined && { seats: dto.seats }),
      ...(dto.status !== undefined && { status: dto.status }),
    };

    const bus = await this.prisma.bus.update({ where: { id }, data });

    await this.audit.record({
      userId: actorId,
      action:
        dto.status !== undefined && dto.status !== current.status
          ? 'BUS_STATUS_CHANGED'
          : 'BUS_UPDATED',
      entity: 'Bus',
      entityId: id,
      // Solo nombres de campos, nunca valores.
      changes: { fields: Object.keys(data) },
    });
    return toBusDto(bus);
  }

  /** Un bus con turnos activos no puede salir de servicio ni quedarse con menos asientos que pasajeros. */
  private async assertShiftsAllow(id: string, current: Bus, dto: UpdateBusDto) {
    const leavingService =
      dto.status !== undefined && dto.status !== 'ACTIVE' && current.status === 'ACTIVE';
    const fewerSeats = dto.seats !== undefined && dto.seats < current.seats;
    if (!leavingService && !fewerSeats) return;

    const shifts = await this.prisma.shift.findMany({
      where: { busId: id, active: true },
      select: { _count: { select: { passengers: true } } },
    });
    if (leavingService && shifts.length > 0) {
      throw new ConflictException(
        `El bus tiene ${shifts.length} ${shifts.length === 1 ? 'turno activo' : 'turnos activos'}: desactívalos o reasígnalos primero`,
      );
    }
    const busiest = Math.max(0, ...shifts.map((shift) => shift._count.passengers));
    if (fewerSeats && dto.seats! < busiest) {
      throw new ConflictException(
        `Un turno activo ya tiene ${busiest} pasajeros: no se pueden reducir los asientos a ${dto.seats}`,
      );
    }
  }

  private async findOrFail(id: string): Promise<Bus> {
    const bus = await this.prisma.bus.findUnique({ where: { id } });
    if (!bus) throw new NotFoundException('Bus no encontrado');
    return bus;
  }

  private async assertPlateFree(plate: string, excludeId?: string) {
    const clash = await this.prisma.bus.findFirst({
      where: {
        plate: { equals: plate, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
    if (clash) throw new ConflictException('La placa ya está registrada');
  }
}
