import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { PaginationQuery } from '../common/pagination';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateMessage = (field: string) => ({ message: `${field} debe tener el formato AAAA-MM-DD` });

export const MAX_PASSENGERS_PER_REQUEST = 100;

export class CreateShiftDto {
  @IsUUID()
  routeId!: string;

  @IsUUID()
  scheduleId!: string;

  @IsUUID()
  busId!: string;

  @IsUUID()
  driverId!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Todos los campos son opcionales; las reglas se validan contra el estado resultante del turno. */
export class UpdateShiftDto extends PartialType(CreateShiftDto) {}

export class ListShiftsQuery extends PaginationQuery {
  /** Filtra por la fecha del horario (inclusive). */
  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('from'))
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, dateMessage('to'))
  to?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'active debe ser true o false' })
  active?: boolean;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsUUID()
  busId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;
}

export class AddPassengersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_PASSENGERS_PER_REQUEST)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  workerIds!: string[];
}
