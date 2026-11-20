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
        <div className="max-w-2xl">
          <h3 className="font-semibold">Cómo publicar tus anuncios</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>Descarga el video de cada idea desde su proyecto («Abrir el video» en Ideas → Descargar).</li>
            <li>En Meta (Instagram y Facebook), TikTok o Google (YouTube), crea un anuncio nuevo, sube el video y copia el texto de este resumen.</li>
            <li>Antes de publicar, mira la vista previa y marca lo revisado en «Revisión».</li>
            <li>Arriba, cambia el estado de la campaña a «Activa». Cuando termine, carga los números en «Comparar».</li>
          </ol>
          <p className="mt-2 text-xs text-tenue">El resumen (.md) es para leer y aprobar; la lista (.csv) se abre en Excel o Google Sheets y sirve a quien arma los anuncios.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="boton" onClick={() => void copiar()} disabled={!md}>{copiado ? "Copiado ✓" : "Copiar el resumen"}</button>
          <a className="boton" href={`/api/anuncios/${ctx.id}/exportar?formato=md`}>Descargar resumen (.md)</a>
          <a className="boton boton-primario" href={`/api/anuncios/${ctx.id}/exportar?formato=csv`}>Descargar lista (.csv)</a>
        </div>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <pre className="tarjeta max-h-[70vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-slate-300">{md ?? "Armando…"}</pre>
    </div>
  );
}
