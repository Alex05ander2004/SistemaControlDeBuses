import { IntersectionType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQuery } from '../common/pagination';
import { Attendance } from '../generated/prisma/client';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateMessage = (field: string) => ({ message: `${field} debe tener el formato AAAA-MM-DD` });
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const NOTES_MIN = 3;
export const NOTES_MAX = 2000;

export class CreateReportDto {
  @IsUUID()
  shiftId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(NOTES_MIN)
  @MaxLength(NOTES_MAX)
  notes!: string;
}

/** Solo se edita el texto: el turno de un informe no cambia. */
export class UpdateReportDto {
  @Transform(trim)
  @IsString()
  @MinLength(NOTES_MIN)
  @MaxLength(NOTES_MAX)
  notes!: string;
}

export class ListReportsQuery extends PaginationQuery {
  /** Fecha del turno, inclusive. */
  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('from'))
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('to'))
  to?: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** Filtros comunes del reporte de asistencia y de su exportación. */
export class AttendanceFilters {
  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('from'))
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('to'))
  to?: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsOptional()
  @IsEnum(Attendance)
  attendance?: Attendance;
}

export class AttendanceReportQuery extends IntersectionType(AttendanceFilters, PaginationQuery) {}
