import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { loginErrorMessage } from './login-errors';

describe('loginErrorMessage', () => {
  it('distingue credenciales incorrectas', () => {
    expect(loginErrorMessage(new ApiError(401, 'x'))).toBe('Usuario o contraseña incorrectos');
  });

  it('avisa del límite de intentos', () => {
    expect(loginErrorMessage(new ApiError(429, 'x'))).toMatch(/Demasiados intentos/);
  });

  it('distingue un error del servidor', () => {
    expect(loginErrorMessage(new ApiError(500, 'x'))).toMatch(/servidor no pudo procesar/);
  });

  it('explica el fallo de conexión o de CORS cuando fetch lanza TypeError', () => {
    expect(loginErrorMessage(new TypeError('Failed to fetch'))).toMatch(/localhost:5173/);
  });
});
