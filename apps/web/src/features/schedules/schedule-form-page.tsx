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
import { useCreateSchedule, useSchedule, useUpdateSchedule } from './schedules-api';
import { formatDuration, formatScheduleDate, minutesBetween } from './types';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const schema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ingresa la fecha')
      .refine(isRealDate, 'La fecha no es válida'),
    departureTime: z.string().regex(TIME_PATTERN, 'Ingresa la hora de salida'),
    arrivalTime: z.string().regex(TIME_PATTERN, 'Ingresa la hora de llegada'),
  })
  .refine(
    (form) =>
      !TIME_PATTERN.test(form.departureTime) ||
      !TIME_PATTERN.test(form.arrivalTime) ||
      minutesBetween(form.departureTime, form.arrivalTime) > 0,
    { message: 'La llegada debe ser posterior a la salida', path: ['arrivalTime'] },
  );

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { date: '', departureTime: '', arrivalTime: '' };

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="size-3.5" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function ScheduleFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const existing = useSchedule(id);
  const create = useCreateSchedule();
  const update = useUpdateSchedule(id ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  const values = useMemo<FormValues | undefined>(() => {
    const record = existing.data;
    if (!record) return undefined;
    return {
      date: record.date,
      departureTime: record.departureTime,
      arrivalTime: record.arrivalTime,
    };
  }, [existing.data]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY, values });

  const invalid = (name: keyof FormValues) => (errors[name] ? true : undefined);
  const describedBy = (name: keyof FormValues) => (errors[name] ? `${name}-error` : undefined);

  const [departure, arrival] = watch(['departureTime', 'arrivalTime']);
  const minutes =
    TIME_PATTERN.test(departure ?? '') && TIME_PATTERN.test(arrival ?? '')
      ? minutesBetween(departure, arrival)
      : 0;

  async function onSubmit(form: FormValues) {
    setServerError(null);
    try {
      if (isEdit) {
        await update.mutateAsync(form);
      } else {
        await create.mutateAsync(form);
      }
      const label = `${formatScheduleDate(form.date)} (${form.departureTime} – ${form.arrivalTime})`;
      navigate('/horarios', {
        state: {
          notice: isEdit
            ? `El horario del ${label} se guardó.`
            : `El horario del ${label} fue creado correctamente.`,
        },
      });
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'No se pudo guardar. Intenta nuevamente.',
      );
    }
  }

  if (isEdit && existing.isPending) {
    return <p className="text-muted-foreground">Cargando horario…</p>;
  }
  if (isEdit && existing.isError) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-danger">
          {existing.error instanceof ApiError && existing.error.status === 404
            ? 'El horario no existe.'
            : 'No se pudo cargar el horario.'}
        </p>
        <Button asChild variant="secondary">
          <Link to="/horarios">Volver a horarios</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to="/horarios"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Horarios
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          {isEdit ? 'Editar horario' : 'Nuevo horario'}
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
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Field label="Fecha" htmlFor="date" error={errors.date?.message}>
                <Input
                  id="date"
                  type="date"
                  aria-invalid={invalid('date')}
                  aria-describedby={describedBy('date')}
                  {...register('date')}
                />
              </Field>
            </div>
            <Field
              label="Hora de salida"
              htmlFor="departureTime"
              error={errors.departureTime?.message}
            >
              <Input
                id="departureTime"
                type="time"
                aria-invalid={invalid('departureTime')}
                aria-describedby={describedBy('departureTime')}
                {...register('departureTime')}
              />
            </Field>
            <Field
              label="Hora de llegada"
              htmlFor="arrivalTime"
              error={errors.arrivalTime?.message}
              hint="Debe ser el mismo día, posterior a la salida"
            >
              <Input
                id="arrivalTime"
                type="time"
                aria-invalid={invalid('arrivalTime')}
                aria-describedby={describedBy('arrivalTime')}
                {...register('arrivalTime')}
              />
            </Field>
            <div className="space-y-2">
              <Label>Duración</Label>
              <p
                className="tnum flex h-10 items-center text-sm text-muted-foreground"
                aria-live="polite"
              >
                {formatDuration(minutes)}
              </p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="secondary">
            <Link to="/horarios">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isEdit ? 'Guardar cambios' : 'Crear horario'}
          </Button>
        </div>
      </form>
    </div>
  );
}
