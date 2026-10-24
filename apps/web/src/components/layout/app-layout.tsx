import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { ROLE_LABEL } from '@/features/auth/types';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openPath, setOpenPath] = useState<string | null>(null);
  // El menú móvil se cierra solo al navegar: queda abierto únicamente en la ruta donde se abrió.
  const menuOpen = openPath === location.pathname;

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const nav = (
    <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 px-3 py-4">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to + label}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {/* Sidebar de escritorio */}
      <aside className="hidden border-r bg-card lg:flex lg:flex-col">
        <Brand className="px-4 py-5" />
        {nav}
      </aside>

      {/* Menú móvil */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpenPath(null)}
          />
          <aside className="relative flex h-full w-64 flex-col bg-card shadow-modal">
            <div className="flex items-center justify-between pr-2">
              <Brand className="px-4 py-5" />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cerrar menú"
                onClick={() => setOpenPath(null)}
              >
                <X className="size-5" />
              </Button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/90 px-4 backdrop-blur lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Abrir menú"
            onClick={() => setOpenPath(location.pathname)}
          >
            <Menu className="size-5" />
          </Button>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold">{user.fullName}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              <LogOut className="size-4" aria-hidden />
              Salir
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
