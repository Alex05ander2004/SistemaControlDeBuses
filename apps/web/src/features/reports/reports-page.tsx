import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AttendanceReportTab } from './attendance-report-tab';
import { ReportsListTab } from './reports-list-tab';

const TABS = [
  { id: 'asistencia', label: 'Asistencia' },
  { id: 'informes', label: 'Informes por turno' },
] as const;

/** Reportes: asistencia por rango (con CSV) e informes por turno. La pestaña vive en `?tab=`. */
export function ReportsPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'informes' ? 'informes' : 'asistencia';

  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );

  function selectTab(id: (typeof TABS)[number]['id']) {
    // Cada pestaña tiene sus propios filtros: al cambiar se parte de cero.
    setParams(new URLSearchParams({ tab: id }), { replace: true });
    setNotice(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reportes</h1>
        <p className="text-muted-foreground">
          Consulta la asistencia, expórtala y registra informes por turno.
        </p>
      </div>

      <div role="tablist" aria-label="Reportes" className="inline-flex rounded-lg bg-muted p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => selectTab(id)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15',
              tab === id
                ? 'bg-card text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success-soft-foreground"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {notice}
        </div>
      )}

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'asistencia' ? <AttendanceReportTab /> : <ReportsListTab onNotice={setNotice} />}
      </div>
    </div>
  );
}
