import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { AddPassengersDto, CreateShiftDto, ListShiftsQuery, UpdateShiftDto } from './shifts.dto';
import { ShiftsService } from './shifts.service';

/** Gestión de turnos y de sus pasajeros: solo ADMIN. Un turno se desactiva con `active: false`. */
@Controller('shifts')
@Roles('ADMIN')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  list(@Query() query: ListShiftsQuery) {
    return this.shifts.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.get(id);
  }

  @Post()
  create(@Body() dto: CreateShiftDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.shifts.create(dto, actor.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shifts.update(id, dto, actor.id);
  }

  @Post(':id/passengers')
  addPassengers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPassengersDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shifts.addPassengers(id, dto.workerIds, actor.id);
  }

  @Delete(':id/passengers/:workerId')
  @HttpCode(204)
  removePassenger(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shifts.removePassenger(id, workerId, actor.id);
  }
}
