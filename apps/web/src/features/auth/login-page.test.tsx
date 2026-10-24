import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from '@/router';
import { AuthProvider } from './auth-provider';

function renderApp(initialPath: string) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

describe('login', () => {
  it('redirige a /login cuando no hay sesión', async () => {
    const router = renderApp('/usuarios');
    expect(await screen.findByRole('heading', { name: 'Bienvenido de nuevo' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('muestra errores de validación con campos vacíos', async () => {
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: /ingresar al sistema/i }));
    expect(await screen.findByText('Ingresa tu usuario o correo')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña')).toBeInTheDocument();
  });

  it('con credenciales de un administrador entra al dashboard', async () => {
    const router = renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Usuario o correo'), 'admin');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'cualquiera');
    await userEvent.click(screen.getByRole('button', { name: /ingresar al sistema/i }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
