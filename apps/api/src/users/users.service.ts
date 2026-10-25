import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../common/audit.service';
import type { Paginated } from '../common/pagination';
import type { Prisma, Role, Sex, User, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto, ListUsersQuery, UpdateUserDto } from './users.dto';

export const AGE_MIN = 18;
export const AGE_MAX = 60;

/** Datos mínimos de un usuario, los que viajan en la sesión. */
export interface UserDto {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
}

/** Ficha completa para la gestión de usuarios. Nunca incluye passwordHash. */
export interface UserDetailDto extends UserDto {
  dni: string;
  birthDate: string;
  sex: Sex;
  phone: string | null;
  address: string | null;
  createdAt: string;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

export function toUserDetail(user: User): UserDetailDto {
  return {
    ...toUserDto(user),
    dni: user.dni,
    birthDate: user.birthDate.toISOString().slice(0, 10),
    sex: user.sex,
    phone: user.phone,
    address: user.address,
    createdAt: user.createdAt.toISOString(),
  };
}

export function ageOn(birthDate: Date, today = new Date()): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function parseBirthDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('birthDate no es una fecha válida');
  }
  const age = ageOn(date);
  if (age < AGE_MIN || age > AGE_MAX) {
    throw new BadRequestException(`La edad debe estar entre ${AGE_MIN} y ${AGE_MAX} años`);
  }
  return date;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Busca por usuario o correo, sin distinguir mayúsculas. */
  findByLogin(login: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: login, mode: 'insensitive' } },
          { email: { equals: login, mode: 'insensitive' } },
        ],
      },
    });
  }

  async list(query: ListUsersQuery): Promise<Paginated<UserDetailDto>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { username: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { dni: { contains: query.search } },
        ],
      }),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: users.map(toUserDetail), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<UserDetailDto> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return toUserDetail(user);
  }

  async create(dto: CreateUserDto, actorId: string): Promise<UserDetailDto> {
    const birthDate = parseBirthDate(dto.birthDate);
    const username = dto.username.toLowerCase();
    const email = dto.email.toLowerCase();
    await this.assertUnique({ username, email, dni: dto.dni });

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        username,
        email,
        passwordHash: await argon2.hash(dto.password),
        dni: dto.dni,
        birthDate,
        sex: dto.sex,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        role: dto.role,
        status: dto.status ?? 'ACTIVE',
      },
    });

    await this.audit.record({
      userId: actorId,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: user.id,
      changes: { username: user.username, role: user.role },
    });
    return toUserDetail(user);
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<UserDetailDto> {
    const current = await this.findById(id);
    if (!current) throw new NotFoundException('Usuario no encontrado');

    const nextRole = dto.role ?? current.role;
    const nextStatus = dto.status ?? current.status;
    const losesAdmin =
      current.role === 'ADMIN' && (nextRole !== 'ADMIN' || nextStatus !== 'ACTIVE');

    if (losesAdmin && current.status === 'ACTIVE') {
      if (id === actorId) {
        throw new ForbiddenException(
          'No puedes quitarte tu propio rol de administrador ni desactivar tu cuenta',
        );
      }
      await this.assertAnotherActiveAdmin(id);
    }

    const stopsDriving =
      current.role === 'DRIVER' &&
      (nextRole !== 'DRIVER' || (nextStatus !== 'ACTIVE' && current.status === 'ACTIVE'));
    if (stopsDriving) {
      const shifts = await this.prisma.shift.count({ where: { driverId: id, active: true } });
      if (shifts > 0) {
        throw new ConflictException(
          `El conductor tiene ${shifts} ${shifts === 1 ? 'turno activo' : 'turnos activos'}: reasígnalos primero`,
        );
      }
    }

    const username = dto.username?.toLowerCase();
    const email = dto.email?.toLowerCase();
    await this.assertUnique({ username, email, dni: dto.dni }, id);

    const data: Prisma.UserUpdateInput = {
      ...(dto.fullName !== undefined && { fullName: dto.fullName }),
      ...(username !== undefined && { username }),
      ...(email !== undefined && { email }),
      ...(dto.dni !== undefined && { dni: dto.dni }),
      ...(dto.birthDate !== undefined && { birthDate: parseBirthDate(dto.birthDate) }),
      ...(dto.sex !== undefined && { sex: dto.sex }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.password !== undefined && { passwordHash: await argon2.hash(dto.password) }),
    };

    const user = await this.prisma.user.update({ where: { id }, data });

    // Desactivar o cambiar la contraseña cierra las sesiones abiertas del usuario.
    if (dto.password !== undefined || (dto.status === 'INACTIVE' && current.status === 'ACTIVE')) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.record({
      userId: actorId,
      action:
        dto.status !== undefined && dto.status !== current.status
          ? 'USER_STATUS_CHANGED'
          : 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      // Solo nombres de campos: nunca valores, para no registrar la contraseña.
      changes: { fields: Object.keys(data) },
    });
    return toUserDetail(user);
  }

  private async assertUnique(
    fields: { username?: string; email?: string; dni?: string },
    excludeId?: string,
  ) {
    const conditions: Prisma.UserWhereInput[] = [
      ...(fields.username
        ? [{ username: { equals: fields.username, mode: 'insensitive' as const } }]
        : []),
      ...(fields.email ? [{ email: { equals: fields.email, mode: 'insensitive' as const } }] : []),
      ...(fields.dni ? [{ dni: fields.dni }] : []),
    ];
    if (conditions.length === 0) return;

    const clashes = await this.prisma.user.findMany({
      where: { OR: conditions, ...(excludeId && { id: { not: excludeId } }) },
    });

    const problems: string[] = [];
    if (fields.username && clashes.some((u) => u.username.toLowerCase() === fields.username))
      problems.push('El usuario ya está en uso');
    if (fields.email && clashes.some((u) => u.email.toLowerCase() === fields.email))
      problems.push('El correo ya está registrado');
    if (fields.dni && clashes.some((u) => u.dni === fields.dni))
      problems.push('El DNI ya está registrado');
    if (problems.length > 0) throw new ConflictException(problems.join('. '));
  }

  private async assertAnotherActiveAdmin(excludeId: string) {
    const others = await this.prisma.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE', id: { not: excludeId } },
    });
    if (others === 0) {
      throw new ForbiddenException('Debe quedar al menos un administrador activo');
    }
  }
}
