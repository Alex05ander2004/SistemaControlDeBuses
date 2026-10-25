export type BusStatus = 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';

export interface BusRecord {
  id: string;
  plate: string;
  brand: string;
  model: string;
  seats: number;
  status: BusStatus;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BusesQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: BusStatus;
}

export interface BusInput {
  plate: string;
  brand: string;
  model: string;
  seats: number;
  status?: BusStatus;
}

export const SEATS_MIN = 10;
export const SEATS_MAX = 80;

export const BUS_STATUSES: BusStatus[] = ['ACTIVE', 'MAINTENANCE', 'RETIRED'];

export const BUS_STATUS_LABEL: Record<BusStatus, string> = {
  ACTIVE: 'Activo',
  MAINTENANCE: 'Mantenimiento',
  RETIRED: 'Baja',
};

export const BUS_STATUS_TONE = {
  ACTIVE: 'success',
  MAINTENANCE: 'warning',
  RETIRED: 'neutral',
} as const;
