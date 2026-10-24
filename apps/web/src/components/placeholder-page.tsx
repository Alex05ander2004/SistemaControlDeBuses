import { Card } from '@/components/ui/card';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <Card className="p-8 text-center text-muted-foreground">
        Este módulo se construirá en la Fase 3.
      </Card>
    </div>
  );
}
