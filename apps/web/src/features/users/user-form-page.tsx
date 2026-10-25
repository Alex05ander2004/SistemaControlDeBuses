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
import { useAuth } from '@/features/auth/auth-context';
import { ROLE_LABEL } from '@/features/auth/types';
import { ApiError } from '@/lib/api';
import { SEX_LABEL, STATUS_LABEL, type UserInput } from './types';
import { useCreateUser, useUpdateUser, useUser } from './users-api';

const PASSWORD_MIN = 10;
const AGE_MIN = 18;
const AGE_MAX = 60;

function ageFrom(birthDate: string, today = new Date()): number {
  const [year, month, day] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) {
    age -= 1;
  }
  return age;
}

function buildSchema(isEdit: boolean) {
  return z.object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Ingresa el nombre completo')
      .max(120, 'Máximo 120 caracteres'),
    username: z
      .string()
      .trim()
      .regex(
        /^[a-zA-Z0-9._-]{3,50}$/,
        'De 3 a 50 caracteres: letras, números, punto, guion o guion bajo',
      ),
    email: z.string().trim().email('Correo no válido').max(120, 'Máximo 120 caracteres'),
    password: isEdit
      ? z
          .string()
          .refine(
            (value) => value === '' || value.length >= PASSWORD_MIN,
            `Mínimo ${PASSWORD_MIN} caracteres`,
          )
      : z.string().min(PASSWORD_MIN, `Mínimo ${PASSWORD_MIN} caracteres`),
    dni: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9]{8,12}$/, 'Entre 8 y 12 letras o números'),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ingresa la fecha de nacimiento')
      .refine((value) => {
        const age = ageFrom(value);
        return age >= AGE_MIN && age <= AGE_MAX;
      }, `La edad debe estar entre ${AGE_MIN} y ${AGE_MAX} años`),
    sex: z.enum(['MALE', 'FEMALE'], { message: 'Selecciona el sexo' }),
    phone: z
      .string()
      .trim()
      .refine((value) => value === '' || /^\+?\d{7,15}$/.test(value), 'Entre 7 y 15 dígitos'),
    address: z.string().trim().max(200, 'Máximo 200 caracteres'),
    role: z.enum(['ADMIN', 'DRIVER', 'WORKER'], { message: 'Selecciona el rol' }),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const EMPTY: FormValues = {
  fullName: '',
  username: '',
  email: '',
  password: '',
  dni: '',
  birthDate: '',
  sex: '' as FormValues['sex'],
  phone: '',
  address: '',
  role: '' as FormValues['role'],
  status: 'ACTIVE',
};

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

export function UserFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const editingSelf = isEdit && id === me?.id;

  const existing = useUser(id);
  const create = useCreateUser();
  const update = useUpdateUser(id ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = useMemo(() => buildSchema(isEdit), [isEdit]);
  const values = useMemo<FormValues | undefined>(() => {
    const record = existing.data;
    if (!record) return undefined;
    return {
      fullName: record.fullName,
      username: record.username,
      email: record.email,
      password: '',
      dni: record.dni,
      birthDate: record.birthDate,
      sex: record.sex,
      phone: record.phone ?? '',
      address: record.address ?? '',
      role: record.role,
      status: record.status,
    };
  }, [existing.data]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
    values,
  });

  const invalid = (name: keyof FormValues) => (errors[name] ? true : undefined);
  const describedBy = (name: keyof FormValues) => (errors[name] ? `${name}-error` : undefined);

  async function onSubmit(form: FormValues) {
    setServerError(null);
    try {
      if (isEdit) {
        const { password, phone, address, ...rest } = form;
        const payload = {
          ...rest,
          // Vacío significa "borrar el dato"; la contraseña vacía significa "no cambiarla".
          phone: phone === '' ? null : phone,
          address: address === '' ? null : address,
          ...(password !== '' && { password }),
        };
        await update.mutateAsync(payload as unknown as Partial<UserInput>);
        navigate('/usuarios', { state: { notice: `Los datos de ${form.fullName} se guardaron.` } });
      } else {
        const { phone, address, ...rest } = form;
        const payload: UserInput = {
          ...rest,
          ...(phone !== '' && { phone }),
          ...(address !== '' && { address }),
        };
        await create.mutateAsync(payload);
        navigate('/usuarios', { state: { notice: `${form.fullName} fue creado correctamente.` } });
      }
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'No se pudo guardar. Intenta nuevamente.',
      );
    }
  }

  if (isEdit && existing.isPending) {
    return <p className="text-muted-foreground">Cargando usuario…</p>;
  }
  if (isEdit && existing.isError) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-danger">
          {existing.error instanceof ApiError && existing.error.status === 404
            ? 'El usuario no existe.'
            : 'No se pudo cargar el usuario.'}
        </p>
        <Button asChild variant="secondary">
          <Link to="/usuarios">Volver a usuarios</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to="/usuarios"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Usuarios
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
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
          <h2 className="text-lg font-semibold">Datos personales</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nombre completo" htmlFor="fullName" error={errors.fullName?.message}>
                <Input
                  id="fullName"
                  autoComplete="off"
                  aria-invalid={invalid('fullName')}
                  aria-describedby={describedBy('fullName')}
                  {...register('fullName')}
                />
              </Field>
            </div>
            <Field label="DNI" htmlFor="dni" error={errors.dni?.message}>
              <Input
                id="dni"
                inputMode="numeric"
                aria-invalid={invalid('dni')}
                aria-describedby={describedBy('dni')}
                {...register('dni')}
              />
            </Field>
            <Field
              label="Fecha de nacimiento"
              htmlFor="birthDate"
              error={errors.birthDate?.message}
              hint={`Edad permitida: ${AGE_MIN} a ${AGE_MAX} años`}
            >
              <Input
                id="birthDate"
                type="date"
                aria-invalid={invalid('birthDate')}
                aria-describedby={describedBy('birthDate')}
                {...register('birthDate')}
              />
            </Field>
            <Field label="Sexo" htmlFor="sex" error={errors.sex?.message}>
              <Select
                id="sex"
                aria-invalid={invalid('sex')}
                aria-describedby={describedBy('sex')}
                {...register('sex')}
              >
                <option value="">Selecciona…</option>
                {Object.entries(SEX_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Celular (opcional)" htmlFor="phone" error={errors.phone?.message}>
              <Input
                id="phone"
                type="tel"
                aria-invalid={invalid('phone')}
                aria-describedby={describedBy('phone')}
                {...register('phone')}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Dirección (opcional)" htmlFor="address" error={errors.address?.message}>
                <Input
                  id="address"
                  autoComplete="off"
                  aria-invalid={invalid('address')}
                  aria-describedby={describedBy('address')}
                  {...register('address')}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card className="space-y-5 p-6">
          <h2 className="text-lg font-semibold">Cuenta y acceso</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Usuario" htmlFor="username" error={errors.username?.message}>
              <Input
                id="username"
                autoComplete="off"
                aria-invalid={invalid('username')}
                aria-describedby={describedBy('username')}
                {...register('username')}
              />
            </Field>
            <Field label="Correo" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="off"
                aria-invalid={invalid('email')}
                aria-describedby={describedBy('email')}
                {...register('email')}
              />
            </Field>
            <Field
              label={isEdit ? 'Nueva contraseña' : 'Contraseña'}
              htmlFor="password"
              error={errors.password?.message}
              hint={
                isEdit
                  ? 'Déjala en blanco para no cambiarla. Cambiarla cierra sus sesiones.'
                  : `Mínimo ${PASSWORD_MIN} caracteres`
              }
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={invalid('password')}
                aria-describedby={describedBy('password')}
                {...register('password')}
              />
            </Field>
            <Field
              label="Rol"
              htmlFor="role"
              error={errors.role?.message}
              hint={editingSelf ? 'No puedes cambiar tu propio rol.' : undefined}
            >
              <Select
                id="role"
                disabled={editingSelf}
                aria-invalid={invalid('role')}
                aria-describedby={describedBy('role')}
                {...register('role')}
              >
                <option value="">Selecciona…</option>
                {Object.entries(ROLE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Estado"
              htmlFor="status"
              error={errors.status?.message}
              hint={editingSelf ? 'No puedes desactivar tu propia cuenta.' : undefined}
            >
              <Select id="status" disabled={editingSelf} {...register('status')}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="secondary">
            <Link to="/usuarios">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </div>
      </form>
    </div>
  );
}
