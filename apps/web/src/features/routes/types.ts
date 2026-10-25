export interface RouteRecord {
  id: string;
  origin: string;
  destination: string;
  active: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RoutesQuery {
  page: number;
  pageSize: number;
  search?: string;
  active?: boolean;
}

export interface RouteInput {
  origin: string;
  destination: string;
  active?: boolean;
}

/** Valores del filtro de estado en el listado y en la URL. */
export type ActiveFilter = 'active' | 'inactive';

export const ACTIVE_FILTER_LABEL: Record<ActiveFilter, string> = {
  active: 'Activas',
  inactive: 'Inactivas',
};
