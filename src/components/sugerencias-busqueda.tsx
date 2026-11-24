"use client";
import { useEffect, useState } from "react";

/**
 * «Lo que busca la gente en YouTube» para lo que se está escribiendo (`/api/busquedas`). Espera a que
 * la persona deje de escribir; si no hay sugerencias o Google no responde, no muestra nada.
 */
export function SugerenciasBusqueda({ consulta, alElegir, texto = "Toca una para usarla." }: { consulta: string; alElegir: (s: string) => void; texto?: string }) {
  const q = consulta.replace(/\s+/g, " ").trim();
  const [lista, setLista] = useState<{ q: string; sugerencias: string[] } | null>(null);

  useEffect(() => {
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/busquedas?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ sugerencias?: string[] }>)
        .then((d) => setLista({ q, sugerencias: d.sugerencias ?? [] }))
        .catch(() => { /* sin red o cancelada: no se muestra nada */ });
    }, 500);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  // Sólo las de lo que está escrito ahora: mientras se escribe, las viejas desaparecen.
  const sugerencias = q.length >= 3 && lista?.q === q ? lista.sugerencias : [];
  if (sugerencias.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5" aria-live="polite">
      <p className="text-xs text-tenue">Lo que busca la gente en YouTube · {texto}</p>
      <div className="flex flex-wrap gap-2 text-sm">
        {sugerencias.map((s) => (
          <button key={s} type="button" className="rounded-full border border-borde px-3 py-1 hover:border-cyan-700" onClick={() => alElegir(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** La línea que se está escribiendo en un cuadro de «un tema por línea». */
export const ultimaLinea = (t: string) => t.split("\n").at(-1) ?? "";

/** Cambia esa línea por la sugerencia elegida, sin tocar las demás. */
export const cambiarUltimaLinea = (t: string, nueva: string) => [...t.split("\n").slice(0, -1), nueva].join("\n");
