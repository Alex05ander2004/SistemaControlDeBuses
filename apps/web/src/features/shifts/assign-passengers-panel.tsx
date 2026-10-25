import { AlertCircle, Loader2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useAddPassengers, usePeopleOptions } from './shifts-api';
import type { ShiftDetail } from './types';

interface AssignPassengersPanelProps {
  shift: ShiftDetail;
  onDone: (count: number) => void;
  onCancel: () => void;
}

/** Panel para elegir colaboradores activos y asignarlos al turno sin superar los asientos libres. */
export function AssignPassengersPanel({ shift, onDone, onCancel }: AssignPassengersPanelProps) {
  const workers = usePeopleOptions('WORKER');
  const add = useAddPassengers(shift.id);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const free = shift.bus.seats - shift.passengerCount;
  const assigned = useMemo(
    () => new Set(shift.passengers.map((p) => p.workerId)),
    [shift.passengers],
  );

  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (workers.data?.items ?? []).filter(
      (worker) =>
        !assigned.has(worker.id) &&
        (term === '' || worker.fullName.toLowerCase().includes(term) || worker.dni.includes(term)),
    );
  }, [workers.data, assigned, search]);

  const overLimit = selected.size > free;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setError(null);
    try {
      await add.mutateAsync(Array.from(selected));
      onDone(selected.size);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'No se pudieron asignar los pasajeros.',
      );
    }
  }

  return (
    <Card className="space-y-4 p-5" aria-label="Asignar pasajeros">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Asignar pasajeros</h3>
        <p className="tnum text-sm text-muted-foreground">
          Asientos libres: <strong className="text-foreground">{free}</strong> · Seleccionados:{' '}
          <strong className={overLimit ? 'text-danger' : 'text-foreground'}>{selected.size}</strong>
        </p>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Buscar colaboradores"
          placeholder="Buscar por nombre o DNI"
          className="pl-10"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}
      {overLimit && (
        <p role="status" className="text-sm text-danger">
          Seleccionaste más colaboradores que asientos libres.
        </p>
      )}

      <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
        {workers.isPending && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            Cargando colaboradores…
          </li>
        )}
        {workers.isError && (
          <li className="px-4 py-6 text-center text-sm text-danger">
            No se pudieron cargar los colaboradores.
          </li>
        )}
        {workers.data && available.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            No hay colaboradores disponibles para asignar.
          </li>
        )}
        {available.map((worker) => (
          <li key={worker.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/60">
              <input
                type="checkbox"
                className="size-4 rounded border accent-primary"
                checked={selected.has(worker.id)}
                onChange={() => toggle(worker.id)}
              />
              <span className="flex-1 text-sm font-medium">{worker.fullName}</span>
              <span className="tnum text-xs text-muted-foreground">{worker.dni}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={add.isPending}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={selected.size === 0 || overLimit || add.isPending}>
          {add.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Asignar ({selected.size})
        </Button>
      </div>
    </Card>
  );
}
