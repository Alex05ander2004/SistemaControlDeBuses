import { Bus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Brand({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'flex size-10 items-center justify-center rounded-lg',
          inverted ? 'bg-white/10 text-white' : 'bg-primary text-primary-foreground',
        )}
      >
        <Bus className="size-5" aria-hidden />
      </div>
      <div className="leading-tight">
        <p
          className={cn(
            'text-lg font-bold tracking-wide',
            inverted ? 'text-white' : 'text-foreground',
          )}
        >
          AIROVA
        </p>
        <p
          className={cn(
            'text-[11px] font-semibold uppercase tracking-widest',
            inverted ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          Control de flota
        </p>
      </div>
    </div>
  );
}
