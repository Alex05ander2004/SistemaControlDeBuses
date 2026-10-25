import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, Matches } from 'class-validator';
import { PaginationQuery } from '../common/pagination';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const dateMessage = (field: string) => ({ message: `${field} debe tener el formato AAAA-MM-DD` });
const timeMessage = (field: string) => ({
  message: `${field} debe tener el formato HH:mm (00:00 a 23:59)`,
});

export class CreateScheduleDto {
  @Matches(DATE_PATTERN, dateMessage('date'))
  date!: string;

  @Matches(TIME_PATTERN, timeMessage('departureTime'))
  departureTime!: string;

  @Matches(TIME_PATTERN, timeMessage('arrivalTime'))
  arrivalTime!: string;
}

/** Todos los campos son opcionales; la regla salida < llegada se valida contra el valor actual. */
export class UpdateScheduleDto extends PartialType(CreateScheduleDto) {}

export class ListSchedulesQuery extends PaginationQuery {
  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('from'))
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('to'))
  to?: string;
}
