import { ApiError } from '@/lib/api';

export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Usuario o contraseña incorrectos';
    if (error.status === 429) return 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.';
    return 'El servidor no pudo procesar el inicio de sesión. Intenta nuevamente.';
  }
  // fetch lanza TypeError cuando no hay conexión o el navegador bloquea la petición (CORS).
  return 'No se pudo conectar con el servidor. Verifica que la API esté en ejecución y que abras la web desde http://localhost:5173.';
}
