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
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useBus, useCreateBus, useUpdateBus } from './buses-api';
import { BUS_STATUS_LABEL, BUS_STATUSES, SEATS_MAX, SEATS_MIN, type BusInput } from './types';

const schema = z.object({
  plate: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z0-9-]{5,10}$/.test(value), 'Entre 5 y 10 letras, números o guiones'),
  brand: z.string().trim().min(2, 'Ingresa la marca').max(60, 'Máximo 60 caracteres'),
  model: z.string().trim().min(2, 'Ingresa el modelo').max(60, 'Máximo 60 caracteres'),
  seats: z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value), 'Ingresa un número entero')
    .refine(
      (value) => Number(value) >= SEATS_MIN && Number(value) <= SEATS_MAX,
      `Debe estar entre ${SEATS_MIN} y ${SEATS_MAX} asientos`,
    ),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'RETIRED']),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const EMPTY: FormInput = { plate: '', brand: '', model: '', seats: '', status: 'ACTIVE' };

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

export function BusFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const existing = useBus(id);
  const create = useCreateBus();
  const update = useUpdateBus(id ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  const values = useMemo<FormInput | undefined>(() => {
    const record = existing.data;
    if (!record) return undefined;
    return {
      plate: record.plate,
      brand: record.brand,
      model: record.model,
      seats: String(record.seats),
      status: record.status,
    };
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

  const invalid = (name: keyof FormInput) => (errors[name] ? true : undefined);
  const describedBy = (name: keyof FormInput) => (errors[name] ? `${name}-error` : undefined);

  async function onSubmit(form: FormOutput) {
    setServerError(null);
    const payload: BusInput = { ...form, seats: Number(form.seats) };
    try {
      if (isEdit) {
        await update.mutateAsync(payload);
        navigate('/buses', {
          state: { notice: `El bus ${payload.plate} se guardó correctamente.` },
        });
      } else {
        await create.mutateAsync(payload);
        navigate('/buses', {
          state: { notice: `El bus ${payload.plate} fue creado correctamente.` },
        });
      }
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'No se pudo guardar. Intenta nuevamente.',
      );
    }
  }

  if (isEdit && existing.isPending) {
    return <p className="text-muted-foreground">Cargando bus…</p>;
  }
  if (isEdit && existing.isError) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-danger">
          {existing.error instanceof ApiError && existing.error.status === 404
            ? 'El bus no existe.'
            : 'No se pudo cargar el bus.'}
        </p>
        <Button asChild variant="secondary">
          <Link to="/buses">Volver a buses</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to="/buses"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Buses
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{isEdit ? 'Editar bus' : 'Nuevo bus'}</h1>
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
          <h2 className="text-lg font-semibold">Datos del vehículo</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Placa"
              htmlFor="plate"
              error={errors.plate?.message}
              hint="Se guarda en mayúsculas"
            >
              <Input
                id="plate"
                autoComplete="off"
                className="uppercase"
                aria-invalid={invalid('plate')}
                aria-describedby={describedBy('plate')}
                {...register('plate')}
              />
            </Field>
            <Field
              label="Asientos"
              htmlFor="seats"
              error={errors.seats?.message}
              hint={`Entre ${SEATS_MIN} y ${SEATS_MAX}`}
            >
              <Input
                id="seats"
                inputMode="numeric"
                aria-invalid={invalid('seats')}
                aria-describedby={describedBy('seats')}
                {...register('seats')}
              />
            </Field>
            <Field label="Marca" htmlFor="brand" error={errors.brand?.message}>
              <Input
                id="brand"
                autoComplete="off"
                aria-invalid={invalid('brand')}
                aria-describedby={describedBy('brand')}
                {...register('brand')}
              />
            </Field>
            <Field label="Modelo" htmlFor="model" error={errors.model?.message}>
              <Input
                id="model"
                autoComplete="off"
                aria-invalid={invalid('model')}
                aria-describedby={describedBy('model')}
                {...register('model')}
              />
            </Field>
            <Field label="Estado" htmlFor="status" error={errors.status?.message}>
              <Select id="status" {...register('status')}>
                {BUS_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {BUS_STATUS_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="secondary">
            <Link to="/buses">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isEdit ? 'Guardar cambios' : 'Crear bus'}
          </Button>
        </div>
      </form>
    </div>
  );
}
