import { cn } from '@/lib/utils';
import { markedCount, type AttendanceSummary } from './types';

interface MarkedProgressProps {
  summary: AttendanceSummary;
  total: number;
  className?: string;
}

/** Avance del marcado: (asistieron + faltaron) sobre el total de pasajeros. */
export function MarkedProgress({ summary, total, className }: MarkedProgressProps) {
  const marked = markedCount(summary);
  const percent = total <= 0 ? 0 : Math.min(100, Math.round((marked / total) * 100));

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        role="progressbar"
        aria-label="Asistencia marcada"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(marked, total)}
        aria-valuetext={`${marked} de ${total} marcados`}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            percent >= 100 ? 'bg-success' : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="tnum text-xs text-muted-foreground">
        {marked} de {total} marcados
      </p>
    </div>
  );
}

/** Barra apilada compacta: asistieron (verde), faltaron (rojo) y pendientes (gris). */
export function SplitBar({
  summary,
  className,
}: {
  summary: AttendanceSummary;
  className?: string;
}) {
  const total = summary.present + summary.absent + summary.pending;
  const width = (value: number) => (total === 0 ? 0 : (value / total) * 100);

  return (
    <div
      role="img"
      aria-label={`${summary.present} asistieron, ${summary.absent} faltaron, ${summary.pending} pendientes`}
      className={cn('flex h-2 w-full min-w-24 overflow-hidden rounded-full bg-muted', className)}
    >
      <div className="bg-success" style={{ width: `${width(summary.present)}%` }} />
      <div className="bg-danger" style={{ width: `${width(summary.absent)}%` }} />
    </div>
  );
}
