"use client";
import { useEffect, useRef, useState } from "react";
import { Aviso, postJson, useSondeo } from "./comun";

interface Paso { id: string; nombre: string; estado: "pendiente" | "trabajando" | "listo" | "error" }
interface Estado { disponible: boolean; falta: string | null; corriendo: boolean; pasos: Paso[]; error: string | null; registro: string[]; inicio: string | null }

const MARCA: Record<Paso["estado"], string> = { pendiente: "○", trabajando: "…", listo: "✓", error: "✗" };
const COLOR: Record<Paso["estado"], string> = { pendiente: "text-tenue", trabajando: "text-sky-300", listo: "text-emerald-300", error: "text-red-300" };

/** Instalar Wan2GP (para «Animar esta escena») con un clic, con sus pasos y el registro por si algo falla. */
export function InstalarWan2gp({ alTerminar }: { alTerminar?: () => void }) {
  const [activo, setActivo] = useState(false);
  const { datos: e, recargar } = useSondeo<Estado>("/api/sistema/wan2gp", activo ? 1500 : 30_000);
  const [error, setError] = useState<string | null>(null);
  const listo = !!e && !e.falta && !e.corriendo;
  // Al terminar una instalación lanzada aquí, Sistema vuelve a revisar (el chequeo pasa a verde).
  const avisado = useRef(false);
  useEffect(() => {
    if (!activo || !listo || avisado.current) return;
    avisado.current = true;
    alTerminar?.();
  }, [activo, listo, alTerminar]);

  async function instalar() {
    if (!confirm("Se van a descargar unos 10 GB (Wan2GP, Python y PyTorch) en la carpeta de herramientas. Tarda entre 15 y 30 minutos según la conexión, y puedes seguir usando Geeper mientras tanto.\n\n¿Instalar ahora?")) return;
    setError(null);
    setActivo(true);
    try {
      await postJson("/api/sistema/wan2gp", {});
      await recargar();
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x));
    }
  }

  if (!e) return null;
  if (!e.disponible) return <p className="mt-2 text-xs text-tenue">Animar escenas necesita una tarjeta de video NVIDIA: en este equipo no se puede.</p>;
  if (listo) {
    return <p className="mt-2 text-xs text-emerald-300">Listo: ya puedes animar escenas desde cada proyecto («Animar esta escena con IA»).</p>;
  }
  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-tenue">
        Sirve para <strong>animar escenas</strong>: convierte la imagen de una escena en un video corto con movimiento, usando la tarjeta de video de este equipo (gratis, sin
        internet después de instalar). Ocupa unos 10 GB; cada motor de animación baja además su modelo la primera vez que lo usas.
      </p>
      {!e.corriendo && (
        <button type="button" className="boton boton-primario" onClick={() => void instalar()}>{e.error ? "Volver a intentar" : "Instalar con un clic"}</button>
      )}
      {(e.corriendo || e.error) && (
        <ol className="space-y-0.5 text-xs" aria-live="polite">
          {e.pasos.map((p) => (
            <li key={p.id} className={COLOR[p.estado]}><span aria-hidden className="inline-block w-4">{MARCA[p.estado]}</span>{p.nombre}</li>
          ))}
        </ol>
      )}
      {e.corriendo && <p className="text-xs text-tenue">Puedes cerrar esta página: la instalación sigue. Lo último: {e.registro.at(-1) ?? "empezando…"}</p>}
      {e.error && <Aviso tipo="error">No se pudo instalar: {e.error}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {e.registro.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-tenue">Ver el registro (para pedir ayuda si algo falla)</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono">{e.registro.slice(-80).join("\n")}</pre>
        </details>
      )}
    </div>
  );
}
