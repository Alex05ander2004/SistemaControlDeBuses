import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto, UserDto, UsersService } from '../users/users.service';
import type { User } from '../generated/prisma/client';

export interface SessionResult {
  accessToken: string;
  user: UserDto;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const INVALID_CREDENTIALS = 'Usuario o contraseña incorrectos';
const INVALID_SESSION = 'Sesión inválida o expirada';

/** Un token recién rotado puede llegar de nuevo por una carrera legítima (dos pestañas, doble efecto). */
const REUSE_GRACE_MS = 10_000;

/** Reutilización dentro del margen de gracia: se rechaza sin cerrar las demás sesiones ni borrar la cookie. */
export class RefreshRaceException extends UnauthorizedException {}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  // Hash falso para que el tiempo de respuesta no revele si el usuario existe.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(login: string, password: string): Promise<SessionResult> {
    const user = await this.users.findByLogin(login.trim());
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, password).catch(() => false);

    if (!user || !valid || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.issueSession(user);
  }

  /** Rota el refresh token: el usado queda revocado y se emite uno nuevo. */
  async refresh(rawToken: string | undefined): Promise<SessionResult> {
    if (!rawToken) throw new UnauthorizedException(INVALID_SESSION);

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!record) throw new UnauthorizedException(INVALID_SESSION);

    // Reutilizar un token ya revocado indica un posible robo: se cierran todas las sesiones.
    if (record.revokedAt) {
      if (Date.now() - record.revokedAt.getTime() < REUSE_GRACE_MS) {
        throw new RefreshRaceException(INVALID_SESSION);
      }
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException(INVALID_SESSION);
    }
    if (record.expiresAt <= new Date() || record.user.status !== 'ACTIVE') {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Otra petición rotó el mismo token en este instante: carrera benigna.
    if (claimed.count === 0) throw new RefreshRaceException(INVALID_SESSION);
    return this.issueSession(record.user);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException(INVALID_SESSION);
    return toUserDto(user);
  }

  private revokeAllForUser(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: User): Promise<SessionResult> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(
      Date.now() + this.config.get('REFRESH_TTL_DAYS', { infer: true }) * 86_400_000,
    );

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
    });
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });

    return { accessToken, user: toUserDto(user), refreshToken, refreshExpiresAt };
  }

  private getDummyHash() {
    this.dummyHash ??= argon2.hash('airova-dummy-password');
    return this.dummyHash;
  }
}
