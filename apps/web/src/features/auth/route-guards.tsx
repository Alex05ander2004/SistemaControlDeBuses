import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth-context';
import { HOME_BY_ROLE, type Role } from './types';

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Cargando…
    </div>
  );
}

/** Exige sesión y, opcionalmente, un rol. Es solo UX: la seguridad real vive en la API. */
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  return <Outlet />;
}

/** Evita que un usuario con sesión vea el login. */
export function RedirectIfAuthenticated() {
  const { user, status } = useAuth();

  if (status === 'loading') return <FullScreenLoader />;
  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  return <Outlet />;
}
