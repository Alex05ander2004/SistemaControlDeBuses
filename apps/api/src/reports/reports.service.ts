import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../common/audit.service';
import { toCsv } from '../common/csv';
import { addDays, dateOnly, daysBetween, formatDateTimeIn, todayIn } from '../common/dates';
import type { Paginated } from '../common/pagination';
import type { Env } from '../config/env';
import type { Attendance, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatTime } from '../schedules/schedules.service';
import type {
  AttendanceFilters,
  AttendanceReportQuery,
  CreateReportDto,
  ListReportsQuery,
  UpdateReportDto,
} from './reports.dto';

/** Rango máximo de un reporte de asistencia (días). */
export const MAX_RANGE_DAYS = 366;
/** Tope de filas de una exportación CSV: más allá hay que acotar el rango. */
export const MAX_EXPORT_ROWS = 50_000;
const DEFAULT_RANGE_DAYS = 30;

const reportInclude = {
  author: true,
  shift: { include: { route: true, schedule: true, bus: true, driver: true } },
} satisfies Prisma.ReportInclude;
type ReportRecord = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

const rowInclude = {
  worker: true,
  markedBy: true,
  shift: { include: { route: true, schedule: true, bus: true, driver: true } },
} satisfies Prisma.ShiftPassengerInclude;
type RowRecord = Prisma.ShiftPassengerGetPayload<{ include: typeof rowInclude }>;

export interface ReportDto {
  id: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; fullName: string };
  shift: {
    id: string;
    date: string;
    departureTime: string;
    arrivalTime: string;
    route: { origin: string; destination: string };
    bus: { plate: string };
    driver: { fullName: string };
  };
}

export interface AttendanceRowDto {
  shiftId: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  route: { origin: string; destination: string };
  busPlate: string;
  driverName: string;
  workerId: string;
  workerName: string;
  workerDni: string;
  attendance: Attendance;
  markedAt: string | null;
  markedBy: string | null;
}

export interface AttendanceTotals {
  total: number;
  present: number;
  absent: number;
  pending: number;
  /** % de asistió sobre (asistió + faltó), con un decimal; null si todavía no hay marcas. */
  attendanceRate: number | null;
}

export interface AttendanceReportDto extends Paginated<AttendanceRowDto> {
  from: string;
  to: string;
  summary: AttendanceTotals;
}

const ATTENDANCE_LABEL: Record<Attendance, string> = {
  PENDING: 'Pendiente',
  PRESENT: 'Asistió',
  ABSENT: 'Faltó',
};

function toReportDto(report: ReportRecord): ReportDto {
  const { shift } = report;
  return {
    id: report.id,
    notes: report.notes,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    author: { id: report.author.id, fullName: report.author.fullName },
    shift: {
      id: shift.id,
      date: shift.schedule.date.toISOString().slice(0, 10),
      departureTime: formatTime(shift.schedule.departureTime),
      arrivalTime: formatTime(shift.schedule.arrivalTime),
      route: { origin: shift.route.origin, destination: shift.route.destination },
      bus: { plate: shift.bus.plate },
      driver: { fullName: shift.driver.fullName },
    },
  };
}

function toRowDto(row: RowRecord): AttendanceRowDto {
  const { shift } = row;
  return {
    shiftId: shift.id,
    date: shift.schedule.date.toISOString().slice(0, 10),
    departureTime: formatTime(shift.schedule.departureTime),
    arrivalTime: formatTime(shift.schedule.arrivalTime),
    route: { origin: shift.route.origin, destination: shift.route.destination },
    busPlate: shift.bus.plate,
    driverName: shift.driver.fullName,
    workerId: row.workerId,
    workerName: row.worker.fullName,
    workerDni: row.worker.dni,
    attendance: row.attendance,
    markedAt: row.markedAt?.toISOString() ?? null,
    markedBy: row.markedBy?.fullName ?? null,
  };
}

function parseDate(value: string, field: string): Date {
  const date = dateOnly(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} no es una fecha válida`);
  }
  return date;
}

const newestShiftFirst = [
  { shift: { schedule: { date: 'desc' } } },
  { shift: { schedule: { departureTime: 'asc' } } },
  { worker: { fullName: 'asc' } },
  { id: 'asc' },
] satisfies Prisma.ShiftPassengerOrderByWithRelationInput[];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('APP_TIMEZONE', { infer: true });
  }

  /* ───────────── Informes por turno ───────────── */

  async list(query: ListReportsQuery): Promise<Paginated<ReportDto>> {
    const from = query.from ? parseDate(query.from, 'from') : undefined;
    const to = query.to ? parseDate(query.to, 'to') : undefined;
    if (from && to && from > to) throw new BadRequestException('from no puede ser posterior a to');

    const where: Prisma.ReportWhereInput = {
      ...(query.shiftId && { shiftId: query.shiftId }),
      ...(query.search && { notes: { contains: query.search, mode: 'insensitive' } }),
      ...((from || to) && {
        shift: { schedule: { date: { ...(from && { gte: from }), ...(to && { lte: to }) } } },
      }),
    };

    const [reports, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        include: reportInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);
    return { items: reports.map(toReportDto), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<ReportDto> {
    const report = await this.prisma.report.findUnique({ where: { id }, include: reportInclude });
    if (!report) throw new NotFoundException('Informe no encontrado');
    return toReportDto(report);
  }

  async create(dto: CreateReportDto, actorId: string): Promise<ReportDto> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: dto.shiftId },
      include: { schedule: true },
    });
    if (!shift) throw new BadRequestException('El turno indicado no existe');

    const date = shift.schedule.date.toISOString().slice(0, 10);
    if (date > todayIn(this.timeZone)) {
      throw new ConflictException(
        `Todavía no se puede crear un informe: el turno es el ${date} (turno futuro)`,
      );
    }

    const report = await this.prisma.report.create({
      data: { shiftId: dto.shiftId, authorId: actorId, notes: dto.notes },
      include: reportInclude,
    });
    await this.audit.record({
      userId: actorId,
      action: 'REPORT_CREATED',
      entity: 'Report',
      entityId: report.id,
      changes: { shiftId: dto.shiftId },
    });
    return toReportDto(report);
  }

  async update(id: string, dto: UpdateReportDto, actorId: string): Promise<ReportDto> {
    await this.findOrFail(id);
    const report = await this.prisma.report.update({
      where: { id },
      data: { notes: dto.notes },
      include: reportInclude,
    });
    await this.audit.record({
      userId: actorId,
      action: 'REPORT_UPDATED',
      entity: 'Report',
      entityId: id,
      changes: { fields: ['notes'] },
    });
    return toReportDto(report);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const report = await this.findOrFail(id);
    await this.prisma.report.delete({ where: { id } });
    await this.audit.record({
      userId: actorId,
      action: 'REPORT_DELETED',
      entity: 'Report',
      entityId: id,
      changes: { shiftId: report.shiftId },
    });
  }

  private async findOrFail(id: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Informe no encontrado');
    return report;
  }

  /* ───────────── Reporte de asistencia ───────────── */

  /** Rango efectivo: por defecto los últimos 30 días hasta hoy; máximo 366 días. */
  private resolveRange(filters: AttendanceFilters): { from: string; to: string } {
    const to = filters.to ?? todayIn(this.timeZone);
    const from = filters.from ?? addDays(to, -DEFAULT_RANGE_DAYS);
    parseDate(from, 'from');
    parseDate(to, 'to');
    if (from > to) throw new BadRequestException('from no puede ser posterior a to');
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
      throw new BadRequestException(`El rango máximo es de ${MAX_RANGE_DAYS} días`);
    }
    return { from, to };
  }

  /** Solo cuentan los turnos activos dentro del rango de fechas. */
  private baseWhere(range: { from: string; to: string }, shiftId?: string) {
    return {
      shift: {
        active: true,
        ...(shiftId && { id: shiftId }),
        schedule: { date: { gte: dateOnly(range.from), lte: dateOnly(range.to) } },
      },
    } satisfies Prisma.ShiftPassengerWhereInput;
  }

  async attendanceReport(query: AttendanceReportQuery): Promise<AttendanceReportDto> {
    const range = this.resolveRange(query);
    const base = this.baseWhere(range, query.shiftId);
    const where: Prisma.ShiftPassengerWhereInput = {
      ...base,
      ...(query.attendance && { attendance: query.attendance }),
    };

    const countWhere = (attendance: Attendance) => ({ ...base, attendance });
    // El resumen cubre todo el rango, sin el filtro de estado: las tarjetas no cambian al filtrar.
    const [rows, total, present, absent, pending] = await this.prisma.$transaction([
      this.prisma.shiftPassenger.findMany({
        where,
        include: rowInclude,
        orderBy: newestShiftFirst,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.shiftPassenger.count({ where }),
      this.prisma.shiftPassenger.count({ where: countWhere('PRESENT') }),
      this.prisma.shiftPassenger.count({ where: countWhere('ABSENT') }),
      this.prisma.shiftPassenger.count({ where: countWhere('PENDING') }),
    ]);

    const marked = present + absent;

    return {
      from: range.from,
      to: range.to,
      summary: {
        total: present + absent + pending,
        present,
        absent,
        pending,
        attendanceRate: marked === 0 ? null : Math.round((present / marked) * 1000) / 10,
      },
      items: rows.map(toRowDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Exportación CSV con los mismos filtros del reporte (sin paginación). */
  async attendanceCsv(filters: AttendanceFilters): Promise<{ filename: string; content: string }> {
    const range = this.resolveRange(filters);
    const where: Prisma.ShiftPassengerWhereInput = {
      ...this.baseWhere(range, filters.shiftId),
      ...(filters.attendance && { attendance: filters.attendance }),
    };

    const total = await this.prisma.shiftPassenger.count({ where });
    if (total > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `Hay demasiadas filas para exportar (${total}): acota el rango de fechas`,
      );
    }
    const rows = await this.prisma.shiftPassenger.findMany({
      where,
      include: rowInclude,
      orderBy: newestShiftFirst,
    });

    const content = toCsv(
      [
        'Fecha',
        'Salida',
        'Llegada',
        'Ruta',
        'Bus',
        'Conductor',
        'Colaborador',
        'DNI',
        'Asistencia',
        'Marcado',
        'Marcado por',
      ],
      rows
        .map(toRowDto)
        .map((row) => [
          row.date,
          row.departureTime,
          row.arrivalTime,
          `${row.route.origin} → ${row.route.destination}`,
          row.busPlate,
          row.driverName,
          row.workerName,
          row.workerDni,
          ATTENDANCE_LABEL[row.attendance],
          row.markedAt ? formatDateTimeIn(this.timeZone, new Date(row.markedAt)) : '',
          row.markedBy,
        ]),
    );
    return { filename: `asistencia_${range.from}_${range.to}.csv`, content };
  }
}
