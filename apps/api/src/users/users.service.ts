import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Role, User } from '../generated/prisma/client';

/** Datos públicos de un usuario: nunca incluye passwordHash. */
export interface UserDto {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: Role;
  status: User['status'];
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

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async list(): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map(toUserDto);
  }
}
