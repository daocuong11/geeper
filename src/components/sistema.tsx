"use client";
import { Aviso, useSondeo } from "./comun";

interface Chequeo { nombre: string; ok: boolean; aviso?: boolean; detalle: string; arreglo?: string }

export function Sistema() {
  const { datos, error } = useSondeo<{ chequeos: Chequeo[] }>("/api/sistema", 30_000);
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Sistema</h1>
      <p className="text-sm text-tenue">Lo mismo que <code>pnpm run doctor</code>: sólo lee, no cambia nada.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!datos && <p className="text-tenue">Revisando…</p>}
      <ul className="space-y-2">
        {datos?.chequeos.map((c) => (
          <li key={c.nombre} className="tarjeta p-3 text-sm [overflow-wrap:anywhere]">
            <span aria-hidden className={c.ok ? "text-emerald-400" : c.aviso ? "text-amber-300" : "text-red-400"}>{c.ok ? "✓" : c.aviso ? "!" : "✗"}</span>{" "}
            <span className="font-medium">{c.nombre}</span>: <span className="text-tenue">{c.detalle}</span>
            {c.arreglo && (!c.ok || c.aviso) && <p className="mt-1 font-mono text-xs text-amber-200">→ {c.arreglo}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
