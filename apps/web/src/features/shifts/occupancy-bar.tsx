import { cn } from '@/lib/utils';
import { occupancy } from './types';

interface OccupancyBarProps {
  passengers: number;
  seats: number;
  className?: string;
}

/** Barra de ocupación: ámbar al llegar al 80 % y roja cuando el bus está lleno. */
export function OccupancyBar({ passengers, seats, className }: OccupancyBarProps) {
  const percent = occupancy(passengers, seats);
  const tone = percent >= 100 ? 'bg-danger' : percent >= 80 ? 'bg-accent' : 'bg-primary';

  return (
    <div
      role="progressbar"
      aria-label="Ocupación del bus"
      aria-valuemin={0}
      aria-valuemax={seats}
      aria-valuenow={Math.min(passengers, seats)}
      aria-valuetext={`${passengers} de ${seats} asientos`}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full transition-all', tone)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
