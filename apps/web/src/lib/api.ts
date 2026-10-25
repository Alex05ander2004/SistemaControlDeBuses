const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/** Se emite cuando la sesión no se pudo renovar: la app debe volver al login. */
export const AUTH_EXPIRED_EVENT = 'auth:expired';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let accessToken: string | null = null;

/** El token de acceso vive solo en memoria (ADR 0003). */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

type RefreshHandler = () => Promise<boolean>;
let refreshHandler: RefreshHandler | null = null;

/** Registra cómo renovar la sesión cuando una petición responde 401. */
export function setRefreshHandler(handler: RefreshHandler | null) {
  refreshHandler = handler;
}

function errorMessage(body: unknown): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join('. ');
  return typeof message === 'string' ? message : 'Ocurrió un error inesperado';
}

function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init);

  // El access token dura 15 min: ante un 401 se renueva la sesión y se reintenta una vez.
  if (response.status === 401 && refreshHandler && !path.startsWith('/auth/')) {
    if (await refreshHandler()) {
      response = await send(path, init);
    } else {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, errorMessage(body));
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
