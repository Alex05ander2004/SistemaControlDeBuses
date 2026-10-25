import type { Role } from '@/features/auth/types';

export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type Sex = 'MALE' | 'FEMALE';

export interface UserRecord {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  dni: string;
  /** AAAA-MM-DD */
  birthDate: string;
  sex: Sex;
  phone: string | null;
  address: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UsersQuery {
  page: number;
  pageSize: number;
  search?: string;
  role?: Role;
  status?: UserStatus;
}

export interface UserInput {
  fullName: string;
  username: string;
  email: string;
  password?: string;
  dni: string;
  birthDate: string;
  sex: Sex;
  phone?: string;
  address?: string;
  role: Role;
  status?: UserStatus;
}

export const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
};

export const SEX_LABEL: Record<Sex, string> = {
  MALE: 'Masculino',
  FEMALE: 'Femenino',
};
