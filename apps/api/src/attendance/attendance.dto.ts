import { IsEnum, IsOptional, Matches } from 'class-validator';
import { PaginationQuery } from '../common/pagination';
import { Attendance } from '../generated/prisma/client';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateMessage = (field: string) => ({ message: `${field} debe tener el formato AAAA-MM-DD` });

export class MarkAttendanceDto {
  /** `PENDING` deshace una marca anterior. */
  @IsEnum(Attendance)
  attendance!: Attendance;
}

export class MyShiftsQuery extends PaginationQuery {
  /** Por defecto, hoy (en la zona horaria de la app). */
  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('from'))
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('to'))
  to?: string;
}

export class OverviewQuery {
  /** Por defecto, hoy (en la zona horaria de la app). */
  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('date'))
  date?: string;
}
