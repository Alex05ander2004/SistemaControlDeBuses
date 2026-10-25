import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useCreateRoute, useRoute, useUpdateRoute } from './routes-api';
import type { RouteInput } from './types';

/** Recorta y colapsa espacios, igual que hace el servidor. */
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');

const place = (name: string) =>
  z
    .string()
    .transform(normalize)
    .pipe(
      z.string().min(2, `Ingresa ${name} (mínimo 2 caracteres)`).max(120, 'Máximo 120 caracteres'),
    );

const schema = z
  .object({
    origin: place('el origen'),
    destination: place('el destino'),
    active: z.boolean(),
  })
  .refine((form) => form.origin.toLowerCase() !== form.destination.toLowerCase(), {
    path: ['destination'],
    message: 'El destino debe ser distinto del origen',
  });

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const EMPTY: FormInput = { origin: '', destination: '', active: true };

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="size-3.5" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function RouteFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const existing = useRoute(id);
  const create = useCreateRoute();
  const update = useUpdateRoute(id ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  const values = useMemo<FormInput | undefined>(() => {
    const record = existing.data;
    if (!record) return undefined;
    return { origin: record.origin, destination: record.destination, active: record.active };
  }, [existing.data]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
    values,
  });

  async function onSubmit(form: FormOutput) {
    setServerError(null);
    const payload: RouteInput = {
      origin: form.origin,
      destination: form.destination,
      active: form.active,
    };
    try {
      if (isEdit) {
        await update.mutateAsync(payload);
        navigate('/rutas', {
          state: { notice: `La ruta ${form.origin} → ${form.destination} se guardó.` },
        });
      } else {
        await create.mutateAsync(payload);
        navigate('/rutas', {
          state: { notice: `La ruta ${form.origin} → ${form.destination} fue creada.` },
        });
      }
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'No se pudo guardar. Intenta nuevamente.',
      );
    }
  }

  if (isEdit && existing.isPending) {
    return <p className="text-muted-foreground">Cargando ruta…</p>;
  }
  if (isEdit && existing.isError) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-danger">
          {existing.error instanceof ApiError && existing.error.status === 404
            ? 'La ruta no existe.'
            : 'No se pudo cargar la ruta.'}
        </p>
        <Button asChild variant="secondary">
          <Link to="/rutas">Volver a rutas</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to="/rutas"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Rutas
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          {isEdit ? 'Editar ruta' : 'Nueva ruta'}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {serverError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {serverError}
          </div>
        )}

        <Card className="space-y-5 p-6">
          <h2 className="text-lg font-semibold">Recorrido</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Origen" htmlFor="origin" error={errors.origin?.message}>
              <Input
                id="origin"
                autoComplete="off"
                placeholder="Ej. Los Olivos"
                aria-invalid={errors.origin ? true : undefined}
                aria-describedby={errors.origin ? 'origin-error' : undefined}
                {...register('origin')}
              />
            </Field>
            <Field label="Destino" htmlFor="destination" error={errors.destination?.message}>
              <Input
                id="destination"
                autoComplete="off"
                placeholder="Ej. Planta Central"
                aria-invalid={errors.destination ? true : undefined}
                aria-describedby={errors.destination ? 'destination-error' : undefined}
                {...register('destination')}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 rounded border accent-primary"
              {...register('active')}
            />
            Ruta activa
          </label>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="secondary">
            <Link to="/rutas">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isEdit ? 'Guardar cambios' : 'Crear ruta'}
          </Button>
        </div>
      </form>
    </div>
  );
}
