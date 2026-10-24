import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { PlaceholderPage } from '@/components/placeholder-page';
import { LoginPage } from '@/features/auth/login-page';
import { RedirectIfAuthenticated, RequireAuth } from '@/features/auth/route-guards';
import { DashboardPage } from '@/features/dashboard/dashboard-page';

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
              { path: 'usuarios', element: <PlaceholderPage title="Usuarios" /> },
              { path: 'buses', element: <PlaceholderPage title="Buses" /> },
              { path: 'rutas', element: <PlaceholderPage title="Rutas" /> },
              { path: 'horarios', element: <PlaceholderPage title="Horarios" /> },
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
