import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { PlaceholderPage } from '@/components/placeholder-page';
import { LoginPage } from '@/features/auth/login-page';
import { RedirectIfAuthenticated, RequireAuth } from '@/features/auth/route-guards';
import { BusFormPage } from '@/features/buses/bus-form-page';
import { BusesPage } from '@/features/buses/buses-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { RouteFormPage } from '@/features/routes/route-form-page';
import { RoutesPage } from '@/features/routes/routes-page';
import { ScheduleFormPage } from '@/features/schedules/schedule-form-page';
import { SchedulesPage } from '@/features/schedules/schedules-page';
import { UserFormPage } from '@/features/users/user-form-page';
import { UsersPage } from '@/features/users/users-page';

export const routes: RouteObject[] = [
  {
    element: <RedirectIfAuthenticated />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            element: <RequireAuth roles={['ADMIN']} />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'usuarios', element: <UsersPage /> },
              { path: 'usuarios/nuevo', element: <UserFormPage /> },
              { path: 'usuarios/:id/editar', element: <UserFormPage /> },
              { path: 'buses', element: <BusesPage /> },
              { path: 'buses/nuevo', element: <BusFormPage /> },
              { path: 'buses/:id/editar', element: <BusFormPage /> },
              { path: 'rutas', element: <RoutesPage /> },
              { path: 'rutas/nuevo', element: <RouteFormPage /> },
              { path: 'rutas/:id/editar', element: <RouteFormPage /> },
              { path: 'horarios', element: <SchedulesPage /> },
              { path: 'horarios/nuevo', element: <ScheduleFormPage /> },
              { path: 'horarios/:id/editar', element: <ScheduleFormPage /> },
              { path: 'turnos', element: <PlaceholderPage title="Turnos" /> },
              { path: 'asistencia', element: <PlaceholderPage title="Asistencia" /> },
              { path: 'reportes', element: <PlaceholderPage title="Reportes" /> },
            ],
          },
          {
            element: <RequireAuth roles={['DRIVER']} />,
            children: [{ path: 'conductor', element: <PlaceholderPage title="Mis turnos" /> }],
          },
          {
            element: <RequireAuth roles={['WORKER']} />,
            children: [{ path: 'colaborador', element: <PlaceholderPage title="Mis turnos" /> }],
          },
          {
            element: <RequireAuth roles={['DRIVER', 'WORKER']} />,
            children: [{ path: 'perfil', element: <PlaceholderPage title="Perfil" /> }],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
