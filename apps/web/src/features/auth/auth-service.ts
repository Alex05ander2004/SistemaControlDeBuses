import { ApiError, apiFetch, setAccessToken } from '@/lib/api';
import type { AuthUser, LoginCredentials } from './types';

interface SessionResponse {
  accessToken: string;
  user: AuthUser;
}

// Simulación solo para desarrollo, hasta que exista la API (Fase 2).
const useMock = import.meta.env.DEV && import.meta.env.VITE_MOCK_AUTH === 'true';

const MOCK_USERS: Record<string, AuthUser> = {
  admin: { id: '1', fullName: 'Carlos Mendoza', username: 'admin', role: 'ADMIN' },
  conductor: { id: '2', fullName: 'Mario Silva', username: 'conductor', role: 'DRIVER' },
  colaborador: { id: '3', fullName: 'Elena Paredes', username: 'colaborador', role: 'WORKER' },
};

export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  if (useMock) {
    const user = MOCK_USERS[credentials.username.trim().toLowerCase()];
    if (!user) throw new ApiError(401, 'Usuario o contraseña incorrectos');
    return user;
  }
  const session = await apiFetch<SessionResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  setAccessToken(session.accessToken);
  return session.user;
}

/** Recupera la sesión usando la cookie de refresh. Devuelve null si no hay sesión. */
export async function restoreSession(): Promise<AuthUser | null> {
  if (useMock) return null;
  try {
    const session = await apiFetch<SessionResponse>('/auth/refresh', { method: 'POST' });
    setAccessToken(session.accessToken);
    return session.user;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  setAccessToken(null);
  if (useMock) return;
  await apiFetch<void>('/auth/logout', { method: 'POST' }).catch(() => undefined);
}
