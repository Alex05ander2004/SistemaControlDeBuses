import { Bus, CalendarDays, ClipboardCheck, Users, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface StatCardProps {
  label: string;
  icon: LucideIcon;
  tint: string;
}

function StatCard({ label, icon: Icon, tint }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={`flex size-8 items-center justify-center rounded-lg ${tint}`}>
          <Icon className="size-4" aria-hidden />
        </div>
      </div>
      <p className="tnum mt-3 text-[28px] font-semibold leading-[34px] tracking-tight">—</p>
      <p className="mt-1 text-xs text-muted-foreground">Disponible cuando exista la API</p>
    </Card>
  );
}

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Resumen operativo de la flota y los turnos.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Buses activos" icon={Bus} tint="bg-primary-soft text-primary" />
        <StatCard label="Turnos de hoy" icon={CalendarDays} tint="bg-warning-soft text-warning" />
        <StatCard label="Pasajeros asignados" icon={Users} tint="bg-info-soft text-info" />
        <StatCard
          label="Asistencia del día"
          icon={ClipboardCheck}
          tint="bg-success-soft text-success-soft-foreground"
        />
      </div>
    </div>
  );
}
