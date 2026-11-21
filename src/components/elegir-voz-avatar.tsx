"use client";
import { useState } from "react";
import { archivo, pedir, useSondeo } from "./comun";

export interface VozElegida { motor: "kokoro" | "voxcpm"; voz: string; nombre: string }
interface Voces { kokoro: { voz: string; nombre: string; detalle: string }[]; guardadas: { id: string; nombre: string; descripcion: string; muestra: string }[] }

/** Botón ▶ que prepara la muestra la primera vez (las de Kokoro se generan en unos segundos). */
function Escuchar({ ruta, kokoro, nombre }: { ruta?: string; kokoro?: string; nombre: string }) {
  const [src, setSrc] = useState<string | null>(ruta ? archivo(ruta) : null);
  const [cargando, setCargando] = useState(false);
  if (src) return <audio controls autoPlay={!ruta} preload="none" src={src} className="h-8 w-full max-w-56" aria-label={`Muestra de ${nombre}`} />;
  return (
    <button type="button" className="boton text-xs" disabled={cargando} onClick={() => {
      setCargando(true);
      pedir<{ ruta: string }>(`/api/voces/muestra?kokoro=${kokoro}`).then((r) => setSrc(archivo(r.ruta))).catch(() => setCargando(false));
    }}>{cargando ? "Preparando…" : "▶ Escuchar"}</button>
  );
}

/**
 * La voz del avatar, elegida escuchándola: las de siempre (Kokoro) y las diseñadas de la biblioteca.
 * Para crear una voz nueva describiéndola, el enlace lleva a «Voz» de cualquier proyecto.
 */
export function ElegirVozAvatar({ valor, cambiar, idioma = "es" }: { valor: VozElegida | null; cambiar: (v: VozElegida) => void; idioma?: string }) {
  const { datos } = useSondeo<Voces>(`/api/voces?idioma=${encodeURIComponent(idioma)}`, 120_000);
  if (!datos) return <p className="text-xs text-tenue">Cargando voces…</p>;
  const opciones: (VozElegida & { detalle: string; ruta?: string })[] = [
    ...datos.kokoro.map((k) => ({ motor: "kokoro" as const, voz: k.voz, nombre: k.nombre, detalle: k.detalle })),
    ...datos.guardadas.map((g) => ({ motor: "voxcpm" as const, voz: g.id, nombre: g.nombre, detalle: g.descripcion || "Voz diseñada", ruta: g.muestra })),
  ];
  return (
    <div className="space-y-2" role="radiogroup" aria-label="Voz del avatar">
      {opciones.map((o) => {
        const elegida = valor?.motor === o.motor && valor.voz === o.voz;
        return (
          <div key={`${o.motor}:${o.voz}`} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${elegida ? "border-cyan-500 bg-cyan-950/30" : "border-borde"}`}>
            <label className="flex min-w-40 flex-1 cursor-pointer items-start gap-2">
              <input type="radio" className="mt-1" checked={elegida} onChange={() => cambiar({ motor: o.motor, voz: o.voz, nombre: o.nombre })} />
              <span><span className="block text-sm">{o.nombre}</span><span className="block text-xs text-tenue">{o.detalle}</span></span>
            </label>
            <Escuchar ruta={o.ruta} kokoro={o.motor === "kokoro" ? o.voz : undefined} nombre={o.nombre} />
          </div>
        );
      })}
      <p className="text-xs text-tenue">¿Ninguna te convence? En cualquier proyecto, «Crear una voz nueva describiéndola» (en la sección de voz) la diseña; después aparece aquí.</p>
    </div>
  );
}
