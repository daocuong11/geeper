"use client";
import { useEffect, useState } from "react";
import { Aviso } from "../comun";
import type { Ctx } from "./campana";

export function PestanaExportar({ ctx, guardar }: { ctx: Ctx; guardar: () => Promise<void> }) {
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await guardar();
        const r = await fetch(`/api/anuncios/${ctx.id}/exportar?formato=md`);
        if (!r.ok) throw new Error(`Error ${r.status}`);
        const t = await r.text();
        if (vivo) setMd(t);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      vivo = false;
    };
    // Se arma una vez al abrir la pestaña, con lo último guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.id]);

  async function copiar() {
    if (!md) return;
    await navigator.clipboard.writeText(md);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="tarjeta flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h3 className="font-semibold">Copy deck y checklist</h3>
          <p className="text-sm text-tenue">El deck (Markdown) es para leer y aprobar; el checklist (CSV) es para quien arma la campaña en el administrador.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="boton" onClick={() => void copiar()} disabled={!md}>{copiado ? "Copiado ✓" : "Copiar Markdown"}</button>
          <a className="boton" href={`/api/anuncios/${ctx.id}/exportar?formato=md`}>Descargar .md</a>
          <a className="boton boton-primario" href={`/api/anuncios/${ctx.id}/exportar?formato=csv`}>Descargar checklist .csv</a>
        </div>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <pre className="tarjeta max-h-[70vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-slate-300">{md ?? "Armando…"}</pre>
    </div>
  );
}
