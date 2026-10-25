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
import { CreateScheduleDto, ListSchedulesQuery, UpdateScheduleDto } from './schedules.dto';
import { SchedulesService } from './schedules.service';

/** Gestión de horarios: solo ADMIN. */
@Controller('schedules')
@Roles('ADMIN')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  list(@Query() query: ListSchedulesQuery) {
    return this.schedules.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedules.get(id);
  }

  @Post()
  create(@Body() dto: CreateScheduleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.schedules.create(dto, actor.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.schedules.update(id, dto, actor.id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    await this.schedules.remove(id, actor.id);
  }
}
