import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, AUTH_EXPIRED_EVENT, apiFetch, setAccessToken, setRefreshHandler } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiFetch', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('token-viejo');
  });

  afterEach(() => {
    fetchMock.mockReset();
    setRefreshHandler(null);
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('envía el token y las credenciales', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await apiFetch('/users');
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-viejo');
    expect(init?.credentials).toBe('include');
  });

  it('ante un 401 renueva la sesión y reintenta una vez con el token nuevo', async () => {
    setRefreshHandler(async () => {
      setAccessToken('token-nuevo');
      return true;
    });
    fetchMock.mockResolvedValueOnce(json(401, { message: 'expirada' }));
    fetchMock.mockResolvedValueOnce(json(200, { datos: 1 }));

    await expect(apiFetch('/users')).resolves.toEqual({ datos: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe(
      'Bearer token-nuevo',
    );
  });

  it('si no puede renovar, avisa que la sesión expiró y lanza el error', async () => {
    setRefreshHandler(async () => false);
    const onExpired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    fetchMock.mockResolvedValueOnce(json(401, { message: 'expirada' }));

    await expect(apiFetch('/users')).rejects.toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  });

  it('no intenta renovar la sesión en las rutas /auth', async () => {
    const refresh = vi.fn(async () => true);
    setRefreshHandler(refresh);
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Credenciales incorrectas' }));

    await expect(apiFetch('/auth/login', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('une los mensajes de validación en un solo texto', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { message: ['uno', 'dos'] }));
    await expect(apiFetch('/users')).rejects.toThrow('uno. dos');
  });
});
