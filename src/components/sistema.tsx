"use client";
import { AvisoPrivados } from "./aviso-privados";
import { Aviso, useSondeo } from "./comun";
import { InstalarPhotocraft } from "./instalar-photocraft";
import { InstalarHerramienta } from "./instalar-herramienta";
import { Novedades } from "./novedades";

interface Chequeo { nombre: string; ok: boolean; aviso?: boolean; detalle: string; arreglo?: string }

export function Sistema() {
  const { datos, error, recargar } = useSondeo<{ chequeos: Chequeo[] }>("/api/sistema", 30_000);
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Sistema</h1>
      <p className="text-sm text-tenue">Lo mismo que <code>pnpm run doctor</code>: sólo lee, no cambia nada (salvo que uses un botón de arreglo).</p>
      <AvisoPrivados alCambiar={() => void recargar()} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!datos && <p className="text-tenue">Revisando…</p>}
      <ul className="space-y-2">
        {datos?.chequeos.map((c) => (
          <li key={c.nombre} className="tarjeta p-3 text-sm [overflow-wrap:anywhere]">
            <span aria-hidden className={c.ok ? "text-emerald-400" : c.aviso ? "text-amber-300" : "text-red-400"}>{c.ok ? "✓" : c.aviso ? "!" : "✗"}</span>{" "}
            <span className="font-medium">{c.nombre}</span>: <span className="text-tenue">{c.detalle}</span>
            {c.arreglo && (!c.ok || c.aviso) && <p className="mt-1 font-mono text-xs text-amber-200">→ {c.arreglo}</p>}
            {c.nombre.startsWith("PhotoCraft") && !c.ok && <InstalarPhotocraft />}
            {c.nombre.startsWith("VectorCraft") && !c.ok && (
              <InstalarHerramienta api="/api/sistema/vectorcraft" paraQue="Sirve para usar logos de Illustrator, PDF, EPS o Affinity (los convierte a SVG nítido) y para vectorizar un logo PNG. Es gratuita y de código abierto; ocupa unos 160 MB." />
            )}
          </li>
        ))}
      </ul>
      <div className="pt-4">
        <Novedades />
      </div>
    </section>
  );
}
