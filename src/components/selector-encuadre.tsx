"use client";
/**
 * «¿Qué se ve?» de cada escena: la miniatura del clip con un recuadro que marca lo que entra en el video
 * (lo de afuera se oscurece) y la cara detectada. Pasar el mouse o el foco del teclado por una opción
 * mueve el recuadro antes de elegirla. El recuadro lo calcula el servidor con la misma función que el
 * compilador (`visibleDe` en src/lib/caras.ts), así la vista previa y el render coinciden.
 */
import { useState } from "react";

export type VisibleV = { todo: true } | { todo: false; x: number; y: number; w: number; h: number };
export interface EncuadreV {
  elegida: string;
  actual: VisibleV;
  cara: { x: number; y: number } | null;
  siguiendoCara: boolean;
  opciones: { id: string; etiqueta: string; ayuda: string; ajuste: string | null; ancla: string | null; visible: VisibleV }[];
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

function descripcion(e: EncuadreV, v: VisibleV): string {
  if (v.todo) return "Se ve el clip entero, más chico, sobre una copia borrosa.";
  if (v.w > 0.995 && v.h > 0.995) return "Se ve el clip entero, a pantalla completa.";
  const resto = Math.round((1 - v.w * v.h) * 100);
  return e.siguiendoCara && v === e.actual ? `Sigue la cara; se recorta el ${resto} % de los bordes.` : `Se recorta el ${resto} % de los bordes.`;
}

export function SelectorEncuadre({ escena, numero, src, encuadre, ocupado, elegir }: {
  escena: string;
  numero: number;
  src: string;
  encuadre: EncuadreV;
  ocupado: boolean;
  elegir: (ajuste: string | undefined, ancla: string | undefined) => void;
}) {
  const [probando, setProbando] = useState<string | null>(null);
  const opcion = encuadre.opciones.find((o) => o.id === probando);
  const v = opcion?.visible ?? encuadre.actual;
  const elegida = encuadre.opciones.find((o) => o.id === encuadre.elegida);
  const ayudaId = `encuadre-ayuda-${escena}`;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">¿Qué se ve?</p>
      <div className="relative inline-block overflow-hidden rounded bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Escena ${numero}`} className="block h-40 w-auto md:h-44" />
        {v.todo ? (
          <span className="absolute inset-0 rounded ring-2 ring-inset ring-white/80" aria-hidden />
        ) : (
          <span aria-hidden
            className="absolute rounded-sm ring-2 ring-white motion-safe:transition-all motion-safe:duration-200"
            style={{ left: pct(v.x), top: pct(v.y), width: pct(v.w), height: pct(v.h), boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)" }} />
        )}
        {encuadre.cara && (
          <span aria-hidden title="Cara detectada"
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300"
            style={{ left: pct(encuadre.cara.x), top: pct(encuadre.cara.y) }} />
        )}
        {opcion && <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-xs">Vista previa</span>}
      </div>
      <p className="min-h-[3lh] max-w-xs text-xs text-tenue" id={ayudaId} aria-live="polite">
        {opcion ? opcion.ayuda : descripcion(encuadre, v)}
        {encuadre.cara && !opcion ? " El círculo marca la cara que encontró Geeper." : ""}
      </p>
      <div role="group" aria-label={`Qué se ve en la escena ${numero}`} aria-describedby={ayudaId} className="flex max-w-xs flex-wrap gap-1.5">
        {encuadre.opciones.map((o) => {
          const activa = o.id === encuadre.elegida;
          return (
            <button key={o.id} type="button" aria-pressed={activa} disabled={ocupado}
              className={`rounded-full border px-2.5 py-1 text-xs ${activa ? "border-white bg-white/15 font-medium" : "border-white/20 text-tenue hover:bg-white/5"}`}
              onMouseEnter={() => setProbando(o.id)} onMouseLeave={() => setProbando(null)}
              onFocus={() => setProbando(o.id)} onBlur={() => setProbando(null)}
              onClick={() => { if (!activa) elegir(o.ajuste ?? undefined, o.ancla ?? undefined); }}>
              {o.id === "auto" && encuadre.siguiendoCara ? "Automático (sigue la cara)" : o.etiqueta}
            </button>
          );
        })}
      </div>
      {elegida && elegida.id !== "auto" && <p className="sr-only">Elegido: {elegida.etiqueta}</p>}
    </div>
  );
}
