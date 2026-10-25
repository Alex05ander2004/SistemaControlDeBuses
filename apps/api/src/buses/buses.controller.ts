import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { CreateBusDto, ListBusesQuery, UpdateBusDto } from './buses.dto';
import { BusesService } from './buses.service';

/** Gestión de buses: solo ADMIN. No hay borrado: la baja es `status: RETIRED`. */
@Controller('buses')
@Roles('ADMIN')
export class BusesController {
  constructor(private readonly buses: BusesService) {}

  @Get()
  list(@Query() query: ListBusesQuery) {
    return this.buses.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.buses.get(id);
  }

  @Post()
  create(@Body() dto: CreateBusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.buses.create(dto, actor.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.buses.update(id, dto, actor.id);
  }
}
