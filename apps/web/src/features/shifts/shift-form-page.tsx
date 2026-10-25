import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatScheduleDate } from '@/features/schedules/types';
import { ApiError } from '@/lib/api';
import {
  useBusOptions,
  useCreateShift,
  usePeopleOptions,
  useRouteOptions,
  useScheduleOptions,
  useShift,
  useUpdateShift,
  type BusOption,
  type PersonOption,
  type RouteOption,
  type ScheduleOption,
} from './shifts-api';

const schema = z.object({
  routeId: z.string().min(1, 'Selecciona la ruta'),
  scheduleId: z.string().min(1, 'Selecciona el horario'),
  busId: z.string().min(1, 'Selecciona el bus'),
  driverId: z.string().min(1, 'Selecciona el conductor'),
  active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { routeId: '', scheduleId: '', busId: '', driverId: '', active: true };

const routeLabel = (route: RouteOption) => `${route.origin} → ${route.destination}`;
const scheduleLabel = (schedule: ScheduleOption) =>
  `${formatScheduleDate(schedule.date)} · ${schedule.departureTime}–${schedule.arrivalTime}`;
const busLabel = (bus: BusOption) => `${bus.plate} · ${bus.seats} asientos`;

/** Al editar, el valor actual debe poder verse aunque ya no figure entre las opciones activas. */
function withCurrent<T extends { id: string }>(
  options: T[] | undefined,
  current: T | undefined,
): T[] {
  const list = options ?? [];
  return current && !list.some((option) => option.id === current.id) ? [current, ...list] : list;
}

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

export function ShiftFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const existing = useShift(id);
  const create = useCreateShift();
  const update = useUpdateShift(id ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  const routes = useRouteOptions();
  const schedules = useScheduleOptions();
  const buses = useBusOptions();
  const drivers = usePeopleOptions('DRIVER');

  const record = existing.data;
  const values = useMemo<FormValues | undefined>(
    () =>
      record
        ? {
            routeId: record.route.id,
            scheduleId: record.schedule.id,
            busId: record.bus.id,
            driverId: record.driver.id,
            active: record.active,
          }
        : undefined,
    [record],
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY, values });

  const routeOptions = withCurrent(routes.data?.items, record?.route);
  const scheduleOptions = [...withCurrent(schedules.data?.items, record?.schedule)].sort(
    (a, b) => a.date.localeCompare(b.date) || a.departureTime.localeCompare(b.departureTime),
  );
  const busOptions = withCurrent(buses.data?.items, record?.bus);
  const driverOptions = withCurrent<PersonOption>(
    drivers.data?.items,
    record ? { id: record.driver.id, fullName: record.driver.fullName, dni: '' } : undefined,
  );

  const invalid = (name: keyof FormValues) => (errors[name] ? true : undefined);
  const describedBy = (name: keyof FormValues) => (errors[name] ? `${name}-error` : undefined);

  async function onSubmit(form: FormValues) {
    setServerError(null);
    try {
      if (isEdit) {
        await update.mutateAsync(form);
        navigate(`/turnos/${id}`, { state: { notice: 'Los cambios del turno se guardaron.' } });
      } else {
        const created = await create.mutateAsync(form);
        navigate(`/turnos/${created.id}`, {
          state: { notice: 'Turno creado. Ahora puedes asignar los pasajeros.' },
        });
      }
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'No se pudo guardar. Intenta nuevamente.',
      );
    }
  }

  if (isEdit && existing.isPending) {
    return <p className="text-muted-foreground">Cargando turno…</p>;
  }
  if (isEdit && existing.isError) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-danger">
          {existing.error instanceof ApiError && existing.error.status === 404
            ? 'El turno no existe.'
            : 'No se pudo cargar el turno.'}
        </p>
        <Button asChild variant="secondary">
          <Link to="/turnos">Volver a turnos</Link>
        </Button>
      </div>
    );
  }

  const optionsLoading =
    routes.isPending || schedules.isPending || buses.isPending || drivers.isPending;
  const optionsFailed = routes.isError || schedules.isError || buses.isError || drivers.isError;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to={isEdit ? `/turnos/${id}` : '/turnos'}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {isEdit ? 'Volver al turno' : 'Turnos'}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          {isEdit ? 'Editar turno' : 'Nuevo turno'}
        </h1>
      </div>

      {optionsFailed && (
        <div
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground"
        >
          No se pudieron cargar las opciones del formulario. Recarga la página.
        </div>
      )}

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
          <Field
            label="Ruta"
            htmlFor="routeId"
            error={errors.routeId?.message}
            hint={
              !optionsLoading && routeOptions.length === 0
                ? 'No hay rutas activas. Crea una primero.'
                : undefined
            }
          >
            <Select
              id="routeId"
              aria-invalid={invalid('routeId')}
              aria-describedby={describedBy('routeId')}
              {...register('routeId')}
            >
              <option value="">Selecciona…</option>
              {routeOptions.map((route) => (
                <option key={route.id} value={route.id}>
                  {routeLabel(route)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Horario"
            htmlFor="scheduleId"
            error={errors.scheduleId?.message}
            hint={
              !optionsLoading && scheduleOptions.length === 0
                ? 'No hay horarios desde hoy. Crea uno primero.'
                : 'Se muestran los horarios desde hoy.'
            }
          >
            <Select
              id="scheduleId"
              aria-invalid={invalid('scheduleId')}
              aria-describedby={describedBy('scheduleId')}
              {...register('scheduleId')}
            >
              <option value="">Selecciona…</option>
              {scheduleOptions.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {scheduleLabel(schedule)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Bus"
              htmlFor="busId"
              error={errors.busId?.message}
              hint={
                !optionsLoading && busOptions.length === 0 ? 'No hay buses activos.' : undefined
              }
            >
              <Select
                id="busId"
                aria-invalid={invalid('busId')}
                aria-describedby={describedBy('busId')}
                {...register('busId')}
              >
                <option value="">Selecciona…</option>
                {busOptions.map((bus) => (
                  <option key={bus.id} value={bus.id}>
                    {busLabel(bus)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Conductor"
              htmlFor="driverId"
              error={errors.driverId?.message}
              hint={
                !optionsLoading && driverOptions.length === 0
                  ? 'No hay conductores activos.'
                  : undefined
              }
            >
              <Select
                id="driverId"
                aria-invalid={invalid('driverId')}
                aria-describedby={describedBy('driverId')}
                {...register('driverId')}
              >
                <option value="">Selecciona…</option>
                {driverOptions.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 rounded border accent-primary"
              {...register('active')}
            />
            Turno activo
          </label>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="secondary">
            <Link to={isEdit ? `/turnos/${id}` : '/turnos'}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isEdit ? 'Guardar cambios' : 'Crear turno'}
          </Button>
        </div>
      </form>
    </div>
  );
}
