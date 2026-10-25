import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { MarkAttendanceDto, MyShiftsQuery, OverviewQuery } from './attendance.dto';
import { AttendanceService } from './attendance.service';

/**
 * Asistencia. Sin prefijo común porque mezcla rutas de varios roles:
 * `/my/shifts` (conductor y colaborador), marcado (conductor y admin) y resumen (admin).
 */
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('my/shifts')
  @Roles('DRIVER', 'WORKER')
  myShifts(@CurrentUser() actor: AuthenticatedUser, @Query() query: MyShiftsQuery) {
    return this.attendance.myShifts(actor, query);
  }

  @Get('my/shifts/:id')
  @Roles('DRIVER', 'WORKER')
  myShift(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.myShift(actor, id);
  }

  @Patch('shifts/:id/passengers/:workerId/attendance')
  @Roles('ADMIN', 'DRIVER')
  mark(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendance.mark(actor, id, workerId, dto.attendance);
  }

  @Get('attendance/overview')
  @Roles('ADMIN')
  overview(@Query() query: OverviewQuery) {
    return this.attendance.overview(query.date);
  }
}
