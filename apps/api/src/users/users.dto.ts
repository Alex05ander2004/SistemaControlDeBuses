import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQuery } from '../common/pagination';
import { Role, Sex, UserStatus } from '../generated/prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Texto vacío equivale a null: permite borrar un dato opcional. */
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export const PASSWORD_MIN_LENGTH = 10;

export class CreateUserDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @Transform(trim)
  @Matches(/^[a-zA-Z0-9._-]{3,50}$/, {
    message: 'username solo admite letras, números, punto, guion y guion bajo (3 a 50)',
  })
  username!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(128)
  password!: string;

  @Transform(trim)
  @Matches(/^[a-zA-Z0-9]{8,12}$/, { message: 'dni debe tener entre 8 y 12 letras o números' })
  dni!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthDate debe tener el formato AAAA-MM-DD' })
  birthDate!: string;

  @IsEnum(Sex)
  sex!: Sex;

  @IsOptional()
  @Transform(trimOrNull)
  @Matches(/^\+?\d{7,15}$/, { message: 'phone debe tener entre 7 y 15 dígitos' })
  phone?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

/** Todos los campos son opcionales; `password` solo se envía para restablecerla. */
export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class ListUsersQuery extends PaginationQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
