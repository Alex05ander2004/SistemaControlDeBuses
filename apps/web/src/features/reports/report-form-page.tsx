import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { todayLocal } from '@/features/attendance/types';
import { formatScheduleDate } from '@/features/schedules/types';
import { useShift, useShifts } from '@/features/shifts/shifts-api';
import type { ShiftRecord } from '@/features/shifts/types';
import { ApiError } from '@/lib/api';
import { useCreateReport, useReport, useUpdateReport } from './reports-api';
import { MAX_NOTES_LENGTH, MIN_NOTES_LENGTH, type ReportShiftRef } from './types';

function buildSchema(isEdit: boolean) {
  return z.object({
    shiftId: isEdit ? z.string() : z.string().min(1, 'Selecciona el turno'),
    notes: z
      .string()
      .trim()
      .min(MIN_NOTES_LENGTH, `Escribe al menos ${MIN_NOTES_LENGTH} caracteres`)
      .max(MAX_NOTES_LENGTH, `Máximo ${MAX_NOTES_LENGTH} caracteres`),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const shiftLabel = (shift: ShiftRecord) =>
  `${formatScheduleDate(shift.schedule.date)} · ${shift.schedule.departureTime}–${shift.schedule.arrivalTime} · ${shift.route.origin} → ${shift.route.destination} · ${shift.bus.plate}`;

/** Turno de solo lectura al editar un informe: el turno no se puede cambiar. */
function ShiftSummary({ shift }: { shift: ReportShiftRef }) {
  return (
    <div className="space-y-1 rounded-lg bg-muted/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Turno
      </p>
      <p className="inline-flex flex-wrap items-center gap-x-2 font-medium">
        <span>{shift.route.origin}</span>
        <ArrowRight className="size-4 text-primary" aria-hidden />
        <span>{shift.route.destination}</span>
      </p>
      <p className="tnum text-sm text-muted-foreground">
        {formatScheduleDate(shift.date)} · {shift.departureTime}–{shift.arrivalTime} ·{' '}
        {shift.bus.plate} · {shift.driver.fullName}
      </p>
    </div>
  );
}

export function ReportFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetShiftId = searchParams.get('shiftId') ?? '';

  const existing = useReport(id);
  const create = useCreateReport();
  const update = useUpdateReport(id ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  // Solo se pueden informar turnos activos cuya fecha ya llegó (hoy o antes).
  const shifts = useShifts({ page: 1, pageSize: 100, to: todayLocal(), active: true });
  const preset = useShift(isEdit ? undefined : presetShiftId || undefined);

  const options = useMemo(() => {
    const list = shifts.data?.items ?? [];
    return preset.data && !list.some((shift) => shift.id === preset.data!.id)
      ? [preset.data, ...list]
      : list;
  }, [shifts.data, preset.data]);

  const schema = useMemo(() => buildSchema(isEdit), [isEdit]);
  const values = useMemo<FormValues | undefined>(
    () =>
      existing.data ? { shiftId: existing.data.shift.id, notes: existing.data.notes } : undefined,
    [existing.data],
  );

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { shiftId: '', notes: '' },
    values,
  });

  // Las opciones llegan después del primer render: se aplica el turno indicado en la URL cuando ya existe.
  useEffect(() => {
    if (isEdit || !presetShiftId || getValues('shiftId')) return;
    if (options.some((shift) => shift.id === presetShiftId)) setValue('shiftId', presetShiftId);
  }, [isEdit, presetShiftId, options, getValues, setValue]);

  const notesLength = (watch('notes') ?? '').length;

  async function onSubmit(form: FormValues) {
    setServerError(null);
    try {
      if (isEdit) {
        await update.mutateAsync({ notes: form.notes });
        navigate('/reportes?tab=informes', {
          state: { notice: 'Los cambios del informe se guardaron.' },
        });
      } else {
        await create.mutateAsync({ shiftId: form.shiftId, notes: form.notes });
        navigate('/reportes?tab=informes', { state: { notice: 'Informe creado correctamente.' } });
      }
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'No se pudo guardar. Intenta nuevamente.',
      );
    }
  }

  if (isEdit && existing.isPending) {
    return <p className="text-muted-foreground">Cargando informe…</p>;
  }
  if (isEdit && existing.isError) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-danger">
          {existing.error instanceof ApiError && existing.error.status === 404
            ? 'El informe no existe.'
            : 'No se pudo cargar el informe.'}
        </p>
        <Button asChild variant="secondary">
          <Link to="/reportes?tab=informes">Volver a informes</Link>
        </Button>
      </div>
    );
  }

  const back = '/reportes?tab=informes';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to={back}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Informes
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          {isEdit ? 'Editar informe' : 'Nuevo informe'}
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
          {isEdit && existing.data ? (
            <ShiftSummary shift={existing.data.shift} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="shiftId">Turno</Label>
              <Select
                id="shiftId"
                aria-invalid={errors.shiftId ? true : undefined}
                aria-describedby={errors.shiftId ? 'shiftId-error' : undefined}
                {...register('shiftId')}
              >
                <option value="">Selecciona…</option>
                {options.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shiftLabel(shift)}
                  </option>
                ))}
              </Select>
              {!errors.shiftId && !shifts.isPending && options.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay turnos activos hasta hoy.</p>
              )}
              {!errors.shiftId && options.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Se muestran los turnos activos hasta hoy.
                </p>
              )}
              {errors.shiftId && (
                <p id="shiftId-error" className="flex items-center gap-1 text-xs text-danger">
                  <AlertCircle className="size-3.5" aria-hidden />
                  {errors.shiftId.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Observaciones</Label>
            <Textarea
              id="notes"
              placeholder="Incidencias, retrasos, novedades del viaje…"
              aria-invalid={errors.notes ? true : undefined}
              aria-describedby={errors.notes ? 'notes-error' : 'notes-count'}
              {...register('notes')}
            />
            <div className="flex items-start justify-between gap-4">
              {errors.notes ? (
                <p id="notes-error" className="flex items-center gap-1 text-xs text-danger">
                  <AlertCircle className="size-3.5" aria-hidden />
                  {errors.notes.message}
                </p>
              ) : (
                <span />
              )}
              <p
                id="notes-count"
                className={`tnum text-xs ${notesLength > MAX_NOTES_LENGTH ? 'text-danger' : 'text-muted-foreground'}`}
              >
                {notesLength} / {MAX_NOTES_LENGTH}
              </p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="secondary">
            <Link to={back}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isEdit ? 'Guardar cambios' : 'Crear informe'}
          </Button>
        </div>
      </form>
    </div>
  );
}
