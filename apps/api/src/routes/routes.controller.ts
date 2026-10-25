import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { CreateRouteDto, ListRoutesQuery, UpdateRouteDto } from './routes.dto';
import { RoutesService } from './routes.service';

/** Gestión de rutas: solo ADMIN. No hay borrado: se desactiva con `active: false`. */
@Controller('routes')
@Roles('ADMIN')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  list(@Query() query: ListRoutesQuery) {
    return this.routes.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.routes.get(id);
  }

  @Post()
  create(@Body() dto: CreateRouteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.routes.create(dto, actor.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.routes.update(id, dto, actor.id);
  }
}
