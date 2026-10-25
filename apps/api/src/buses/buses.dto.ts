import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQuery } from '../common/pagination';
import { BusStatus } from '../generated/prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimUpper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const SEATS_MIN = 10;
export const SEATS_MAX = 80;

export class CreateBusDto {
  @Transform(trimUpper)
  @Matches(/^[A-Z0-9-]{5,10}$/, {
    message: 'plate debe tener entre 5 y 10 letras, números o guiones',
  })
  plate!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  brand!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  model!: string;

  @Type(() => Number)
  @IsInt()
  @Min(SEATS_MIN)
  @Max(SEATS_MAX)
  seats!: number;

  @IsOptional()
  @IsEnum(BusStatus)
  status?: BusStatus;
}

/** Todos los campos son opcionales. */
export class UpdateBusDto extends PartialType(CreateBusDto) {}

export class ListBusesQuery extends PaginationQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(BusStatus)
  status?: BusStatus;
}
