export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  DATABASE_URL: string;
  API_PORT: number;
  WEB_ORIGIN: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  REFRESH_TTL_DAYS: number;
}

/** Convierte duraciones tipo "15m", "1h" o "900" a segundos. */
export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(value.trim());
  if (!match) throw new Error(`Duración inválida: "${value}" (usa 900, 15m, 1h o 7d)`);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] ?? 's']!;
  return Number(match[1]) * unit;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const get = (key: string): string | undefined => {
    const value = raw[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  };
  const required = (key: string): string => {
    const value = get(key);
    if (!value) throw new Error(`Falta la variable de entorno ${key}`);
    return value;
  };

  const secret = required('JWT_ACCESS_SECRET');
  if (secret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET debe tener al menos 32 caracteres');
  }

  const nodeEnv = get('NODE_ENV') ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(`NODE_ENV inválido: ${nodeEnv}`);
  }

  const port = Number(get('API_PORT') ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT debe ser un puerto válido');
  }

  const refreshDays = Number(get('REFRESH_TTL_DAYS') ?? 7);
  if (!Number.isInteger(refreshDays) || refreshDays < 1) {
    throw new Error('REFRESH_TTL_DAYS debe ser un entero positivo');
  }

  return {
    NODE_ENV: nodeEnv as Env['NODE_ENV'],
    DATABASE_URL: required('DATABASE_URL'),
    API_PORT: port,
    WEB_ORIGIN: get('WEB_ORIGIN') ?? 'http://localhost:5173',
    JWT_ACCESS_SECRET: secret,
    JWT_ACCESS_TTL_SECONDS: parseDurationSeconds(get('JWT_ACCESS_TTL') ?? '15m'),
    REFRESH_TTL_DAYS: refreshDays,
  };
}
