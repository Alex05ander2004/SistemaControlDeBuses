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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import {
  AttendanceFilters,
  AttendanceReportQuery,
  CreateReportDto,
  ListReportsQuery,
  UpdateReportDto,
} from './reports.dto';
import { ReportsService } from './reports.service';

/**
 * Informes por turno y reporte de asistencia: solo ADMIN.
 * Las rutas estáticas (`attendance`, `attendance.csv`) van antes de `:id`.
 */
@Controller('reports')
@Roles('ADMIN')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('attendance')
  attendance(@Query() query: AttendanceReportQuery) {
    return this.reports.attendanceReport(query);
  }

  @Get('attendance.csv')
  async attendanceCsv(
    @Query() query: AttendanceFilters,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, content } = await this.reports.attendanceCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Datos personales: que ningún intermediario los guarde.
    res.setHeader('Cache-Control', 'no-store');
    return content;
  }

  @Get()
  list(@Query() query: ListReportsQuery) {
    return this.reports.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.get(id);
  }

  @Post()
  create(@Body() dto: CreateReportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.create(dto, actor.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reports.update(id, dto, actor.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.reports.remove(id, actor.id);
  }
}
