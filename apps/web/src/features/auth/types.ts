export type Role = 'ADMIN' | 'DRIVER' | 'WORKER';

export interface AuthUser {
  id: string;
  fullName: string;
  username: string;
  role: Role;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

/** Ruta de inicio de cada rol. */
export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: '/',
  DRIVER: '/conductor',
  WORKER: '/colaborador',
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  DRIVER: 'Conductor',
  WORKER: 'Colaborador',
};
