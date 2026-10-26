import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, rows = 6, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'min-h-24 w-full resize-y rounded-lg border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
        'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
