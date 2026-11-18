"use client";
import { useState } from "react";
import { Aviso, pedir, useSondeo } from "./comun";

interface Fila { slug: string; nombre: string; datos: Record<string, unknown> }

function Editor({ p, alGuardar }: { p: Fila; alGuardar: () => void }) {
  const [texto, setTexto] = useState(JSON.stringify(p.datos, null, 2));
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; t: string } | null>(null);
  async function guardar() {
    try {
      await pedir(`/api/plantillas/${p.slug}`, { method: "PUT", headers: { "content-type": "application/json" }, body: texto });
      setMsg({ tipo: "ok", t: "Guardada. Se aplica en el próximo render de cada proyecto que la use." });
      alGuardar();
    } catch (e) {
      setMsg({ tipo: "error", t: e instanceof Error ? e.message : String(e) });
    }
  }
  const c = (p.datos.colores ?? {}) as Record<string, string>;
  return (
    <div className="tarjeta space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-medium">{p.nombre}</h2>
        <div className="flex gap-1" aria-hidden>{Object.values(c).map((x, i) => <span key={i} className="h-4 w-4 rounded-full border border-borde" style={{ background: x }} />)}</div>
        <span className="text-xs text-tenue">{String(p.datos.descripcion ?? "")}</span>
      </div>
      <label className="etiqueta" htmlFor={`pl-${p.slug}`}>Datos (JSON validado: colores, tipografía, logo, CTA, tarjeta final, voz, música)</label>
      <textarea id={`pl-${p.slug}`} className="campo min-h-72 font-mono text-xs" value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} />
      {msg && <Aviso tipo={msg.tipo}>{msg.t}</Aviso>}
      <button type="button" className="boton boton-primario" onClick={() => void guardar()}>Guardar</button>
    </div>
  );
}

export function Plantillas() {
  const { datos, recargar } = useSondeo<{ plantillas: Fila[] }>("/api/plantillas", 600_000);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Plantillas de canal</h1>
      <p className="text-sm text-tenue">Las plantillas son datos, no código. Cambiar una no toca los proyectos guardados hasta que se vuelvan a renderizar.</p>
      {datos?.plantillas.map((p) => <Editor key={p.slug} p={p} alGuardar={() => void recargar()} />)}
    </section>
  );
}
