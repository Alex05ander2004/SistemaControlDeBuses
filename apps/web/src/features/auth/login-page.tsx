import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from './auth-context';
import { HOME_BY_ROLE } from './types';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Ingresa tu usuario o correo'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    try {
      const user = await login(values);
      navigate(HOME_BY_ROLE[user.role], { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.status === 401
          ? 'Usuario o contraseña incorrectos'
          : 'No se pudo iniciar sesión. Intenta nuevamente.',
      );
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-linear-to-br from-primary-pressed via-[#1e3a8a] to-primary p-12 text-white lg:flex">
        <Brand inverted />
        <div className="max-w-md space-y-4">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Gestión inteligente y puntual para el transporte de tus colaboradores
          </h2>
          <p className="text-lg text-white/75">
            Administra buses, rutas, horarios y turnos, y registra la asistencia de cada viaje en un
            solo lugar.
          </p>
        </div>
        <p className="text-sm text-white/60">© {new Date().getFullYear()} AIROVA</p>
      </aside>

      <main className="flex items-center justify-center bg-card p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <Brand className="lg:hidden" />

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Bienvenido de nuevo</h1>
            <p className="text-muted-foreground">
              Ingresa tus credenciales para acceder al panel de control.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {formError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Usuario o correo</Label>
              <div className="relative">
                <User
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder="ej. cmendoza"
                  className="bg-muted pl-10"
                  aria-invalid={errors.username ? true : undefined}
                  aria-describedby={errors.username ? 'username-error' : undefined}
                  {...register('username')}
                />
              </div>
              {errors.username && (
                <FieldError id="username-error" message={errors.username.message} />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="bg-muted px-10"
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && (
                <FieldError id="password-error" message={errors.password.message} />
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <>
                  Ingresar al sistema
                  <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            ¿Problemas para ingresar? Contacta al administrador del sistema.
          </p>
        </div>
      </main>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} className="flex items-center gap-1 text-xs text-danger">
      <AlertCircle className="size-3.5" aria-hidden />
      {message}
    </p>
  );
}
