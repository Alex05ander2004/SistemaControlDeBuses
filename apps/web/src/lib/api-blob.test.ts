import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  AUTH_EXPIRED_EVENT,
  apiBlob,
  filenameFrom,
  setAccessToken,
  setRefreshHandler,
} from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const file = (status: number, content: string, disposition?: string) =>
  new Response(content, {
    status,
    headers: {
      'Content-Type': 'text/csv',
      ...(disposition ? { 'Content-Disposition': disposition } : {}),
    },
  });

describe('apiBlob', () => {
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

  it('descarga el contenido con el token y toma el nombre de Content-Disposition', async () => {
    fetchMock.mockResolvedValueOnce(
      file(200, 'a,b\n1,2', 'attachment; filename="asistencia_2026-10-01_2026-10-31.csv"'),
    );

    const { blob, filename } = await apiBlob('/reports/attendance.csv?from=2026-10-01', 'x.csv');

    expect(filename).toBe('asistencia_2026-10-01_2026-10-31.csv');
    expect(await blob.text()).toBe('a,b\n1,2');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/reports/attendance.csv?from=2026-10-01');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-viejo');
    expect(init?.credentials).toBe('include');
  });

  it('usa el nombre de respaldo si el servidor no lo envía', async () => {
    fetchMock.mockResolvedValueOnce(file(200, 'x'));
    expect((await apiBlob('/descarga', 'respaldo.csv')).filename).toBe('respaldo.csv');
  });

  it('ante un 401 renueva la sesión y reintenta con el token nuevo', async () => {
    setRefreshHandler(async () => {
      setAccessToken('token-nuevo');
      return true;
    });
    fetchMock.mockResolvedValueOnce(json(401, { message: 'expirada' }));
    fetchMock.mockResolvedValueOnce(file(200, 'ok', 'attachment; filename="a.csv"'));

    const { filename } = await apiBlob('/reports/attendance.csv');

    expect(filename).toBe('a.csv');
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

    await expect(apiBlob('/reports/attendance.csv')).rejects.toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  });

  it('convierte un error del servidor en ApiError con su mensaje', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { message: 'El rango máximo es de 366 días' }));
    const error = await apiBlob('/reports/attendance.csv').catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'El rango máximo es de 366 días' });
  });
});

describe('filenameFrom', () => {
  it('lee filename simple, con comillas o codificado en UTF-8', () => {
    expect(filenameFrom('attachment; filename=reporte.csv', 'x')).toBe('reporte.csv');
    expect(filenameFrom('attachment; filename="a b.csv"', 'x')).toBe('a b.csv');
    expect(filenameFrom("attachment; filename*=UTF-8''asistencia%20d%C3%ADa.csv", 'x')).toBe(
      'asistencia día.csv',
    );
  });

  it('devuelve el respaldo si no hay cabecera o no trae nombre', () => {
    expect(filenameFrom(null, 'x.csv')).toBe('x.csv');
    expect(filenameFrom('attachment', 'x.csv')).toBe('x.csv');
  });
});
