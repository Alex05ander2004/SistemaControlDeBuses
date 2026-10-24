import {
  Bus,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileBarChart,
  LayoutDashboard,
  MapPinned,
  Route,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/features/auth/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN'], end: true },
  { to: '/usuarios', label: 'Usuarios', icon: Users, roles: ['ADMIN'] },
  { to: '/buses', label: 'Buses', icon: Bus, roles: ['ADMIN'] },
  { to: '/rutas', label: 'Rutas', icon: Route, roles: ['ADMIN'] },
  { to: '/horarios', label: 'Horarios', icon: CalendarClock, roles: ['ADMIN'] },
  { to: '/turnos', label: 'Turnos', icon: CalendarDays, roles: ['ADMIN'] },
  { to: '/asistencia', label: 'Asistencia', icon: ClipboardCheck, roles: ['ADMIN'] },
  { to: '/reportes', label: 'Reportes', icon: FileBarChart, roles: ['ADMIN'] },
  { to: '/conductor', label: 'Mis turnos', icon: MapPinned, roles: ['DRIVER'], end: true },
  { to: '/colaborador', label: 'Mis turnos', icon: MapPinned, roles: ['WORKER'], end: true },
  { to: '/perfil', label: 'Perfil', icon: UserCircle, roles: ['DRIVER', 'WORKER'] },
];
