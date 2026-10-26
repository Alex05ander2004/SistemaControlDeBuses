import { ArrowRight, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { formatMarkedAt } from '@/features/attendance/types';
import { formatScheduleDate } from '@/features/schedules/types';
import { ATTENDANCE_LABEL, ATTENDANCE_TONE } from '@/features/shifts/types';
import { ApiError } from '@/lib/api';
import { saveBlob } from './download';
import { downloadAttendanceCsv, useAttendanceReport } from './reports-api';
import { formatRate, type Attendance } from './types';

const PAGE_SIZE = 20;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATES: Attendance[] = ['PRESENT', 'ABSENT', 'PENDING'];

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`tnum mt-1 text-2xl font-semibold tracking-tight ${className ?? ''}`}>
        {value}
      </p>
    </Card>
  );
}

/** Reporte de asistencia por rango de fechas, con exportación a CSV. */
export function AttendanceReportTab() {
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page')) || 1);
  const from = DATE_PATTERN.test(params.get('from') ?? '') ? params.get('from')! : undefined;
  const to = DATE_PATTERN.test(params.get('to') ?? '') ? params.get('to')! : undefined;
  const estado = params.get('estado');
  const attendance = STATES.find((state) => state === estado);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const report = useAttendanceReport({ page, pageSize: PAGE_SIZE, from, to, attendance });
  const data = report.data;

  function updateParams(changes: Record<string, string | undefined>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  async function exportCsv() {
    setExportError(null);
    setExporting(true);
    try {
      // Se exportan las fechas que se ven en pantalla, también cuando son las del servidor por defecto.
      const { blob, filename } = await downloadAttendanceCsv({
        from: from ?? data?.from,
        to: to ?? data?.to,
        attendance,
      });
      saveBlob(blob, filename);
    } catch (caught) {
      setExportError(caught instanceof ApiError ? caught.message : 'No se pudo exportar el CSV.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Desde
            <Input
              type="date"
              aria-label="Desde"
              className="w-auto"
              value={from ?? data?.from ?? ''}
              onChange={(event) => updateParams({ from: event.target.value, page: undefined })}
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Hasta
            <Input
              type="date"
              aria-label="Hasta"
              className="w-auto"
              value={to ?? data?.to ?? ''}
              onChange={(event) => updateParams({ to: event.target.value, page: undefined })}
            />
          </label>
          <Select
            aria-label="Filtrar por estado"
            className="w-auto"
            value={attendance ?? ''}
            onChange={(event) => updateParams({ estado: event.target.value, page: undefined })}
          >
            <option value="">Todos los estados</option>
            {STATES.map((state) => (
              <option key={state} value={state}>
                {ATTENDANCE_LABEL[state]}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={exporting || !data}>
          {exporting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          {exporting ? 'Exportando…' : 'Exportar CSV'}
        </Button>
      </div>

      {exportError && (
        <div
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground"
        >
          {exportError}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Resumen del rango">
          <Stat label="Total" value={String(data.summary.total)} />
          <Stat
            label="Asistieron"
            value={String(data.summary.present)}
            className="text-success-soft-foreground"
          />
          <Stat
            label="Faltaron"
            value={String(data.summary.absent)}
            className="text-danger-soft-foreground"
          />
          <Stat
            label="Pendientes"
            value={String(data.summary.pending)}
            className="text-info-soft-foreground"
          />
          <Stat label="Tasa de asistencia" value={formatRate(data.summary.attendanceRate)} />
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-background text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha y horario</th>
                <th className="px-4 py-3 font-semibold">Ruta</th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">Bus y conductor</th>
                <th className="px-4 py-3 font-semibold">Colaborador</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Marcado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.isPending && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando reporte…
                  </td>
                </tr>
              )}
              {report.isError && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-danger">
                    {report.error instanceof ApiError && report.error.status === 400
                      ? report.error.message
                      : 'No se pudo cargar el reporte.'}{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => report.refetch()}
                    >
                      Reintentar
                    </button>
                  </td>
                </tr>
              )}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No hay registros de asistencia en este rango.
                  </td>
                </tr>
              )}
              {data?.items.map((row) => (
                <tr key={`${row.shiftId}-${row.workerId}`} className="h-16 hover:bg-muted/60">
                  <td className="whitespace-nowrap px-4 py-2">
                    <p className="font-medium">{formatScheduleDate(row.date)}</p>
                    <p className="tnum text-xs text-muted-foreground">
                      {row.departureTime} – {row.arrivalTime}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span>{row.route.origin}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                      <span>{row.route.destination}</span>
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2 lg:table-cell">
                    <p className="tnum font-medium">{row.busPlate}</p>
                    <p className="text-xs text-muted-foreground">{row.driverName}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <p className="font-medium">{row.workerName}</p>
                    <p className="tnum text-xs text-muted-foreground">{row.workerDni}</p>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={ATTENDANCE_TONE[row.attendance]}>
                      {ATTENDANCE_LABEL[row.attendance]}
                    </Badge>
                  </td>
                  <td className="tnum hidden whitespace-nowrap px-4 py-2 text-xs text-muted-foreground md:table-cell">
                    {row.markedAt
                      ? `${formatMarkedAt(row.markedAt)}${row.markedBy ? ` · ${row.markedBy}` : ''}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : undefined })}
          />
        )}
      </Card>
    </div>
  );
}
