import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQuery } from '../common/pagination';

/** Recorta y colapsa los espacios internos: "  Los   Olivos " → "Los Olivos". */
const place = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** 'true'/'false' → boolean; cualquier otro valor se deja tal cual para que IsBoolean responda 400. */
const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateRouteDto {
  @Transform(place)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  origin!: string;

  @Transform(place)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  destination!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Todos los campos son opcionales. */
export class UpdateRouteDto extends PartialType(CreateRouteDto) {}

export class ListRoutesQuery extends PaginationQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;
}
