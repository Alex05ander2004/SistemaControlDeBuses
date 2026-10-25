import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import type { Paginated } from '../common/pagination';
import type { Prisma, Route } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRouteDto, ListRoutesQuery, UpdateRouteDto } from './routes.dto';

export interface RouteDto {
  id: string;
  origin: string;
  destination: string;
  active: boolean;
  createdAt: string;
}

export function toRouteDto(route: Route): RouteDto {
  return {
    id: route.id,
    origin: route.origin,
    destination: route.destination,
    active: route.active,
    createdAt: route.createdAt.toISOString(),
  };
}

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListRoutesQuery): Promise<Paginated<RouteDto>> {
    const where: Prisma.RouteWhereInput = {
      ...(query.active !== undefined && { active: query.active }),
      ...(query.search && {
        OR: [
          { origin: { contains: query.search, mode: 'insensitive' } },
          { destination: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [routes, total] = await this.prisma.$transaction([
      this.prisma.route.findMany({
        where,
        orderBy: [{ origin: 'asc' }, { destination: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.route.count({ where }),
    ]);

    return { items: routes.map(toRouteDto), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<RouteDto> {
    return toRouteDto(await this.findOrFail(id));
  }

  async create(dto: CreateRouteDto, actorId: string): Promise<RouteDto> {
    this.assertDistinct(dto.origin, dto.destination);
    await this.assertUnique(dto.origin, dto.destination);

    const route = await this.prisma.route.create({
      data: { origin: dto.origin, destination: dto.destination, active: dto.active ?? true },
    });

    await this.audit.record({
      userId: actorId,
      action: 'ROUTE_CREATED',
      entity: 'Route',
      entityId: route.id,
      changes: { origin: route.origin, destination: route.destination },
    });
    return toRouteDto(route);
  }

  async update(id: string, dto: UpdateRouteDto, actorId: string): Promise<RouteDto> {
    const current = await this.findOrFail(id);

    if (dto.active === false && current.active) {
      const shifts = await this.prisma.shift.count({ where: { routeId: id, active: true } });
      if (shifts > 0) {
        throw new ConflictException(
          `La ruta tiene ${shifts} ${shifts === 1 ? 'turno activo' : 'turnos activos'}: desactívalos o reasígnalos primero`,
        );
      }
    }

    const origin = dto.origin ?? current.origin;
    const destination = dto.destination ?? current.destination;
    this.assertDistinct(origin, destination);
    if (dto.origin !== undefined || dto.destination !== undefined) {
      await this.assertUnique(origin, destination, id);
    }

    const data: Prisma.RouteUpdateInput = {
      ...(dto.origin !== undefined && { origin: dto.origin }),
      ...(dto.destination !== undefined && { destination: dto.destination }),
      ...(dto.active !== undefined && { active: dto.active }),
    };
    const route = await this.prisma.route.update({ where: { id }, data });

    await this.audit.record({
      userId: actorId,
      action:
        dto.active !== undefined && dto.active !== current.active
          ? 'ROUTE_STATUS_CHANGED'
          : 'ROUTE_UPDATED',
      entity: 'Route',
      entityId: id,
      changes: { fields: Object.keys(data) },
    });
    return toRouteDto(route);
  }

  private async findOrFail(id: string): Promise<Route> {
    const route = await this.prisma.route.findUnique({ where: { id } });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    return route;
  }

  private assertDistinct(origin: string, destination: string) {
    if (origin.toLowerCase() === destination.toLowerCase()) {
      throw new BadRequestException('El origen y el destino deben ser distintos');
    }
  }

  /** La pareja (origen, destino) es única sin distinguir mayúsculas. */
  private async assertUnique(origin: string, destination: string, excludeId?: string) {
    const clash = await this.prisma.route.findFirst({
      where: {
        origin: { equals: origin, mode: 'insensitive' },
        destination: { equals: destination, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
    if (clash) throw new ConflictException('Ya existe una ruta con ese origen y destino');
  }
}
