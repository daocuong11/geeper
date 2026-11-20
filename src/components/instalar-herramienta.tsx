"use client";
import { useState } from "react";
import { Aviso, postJson, useSondeo } from "./comun";

interface Estado { version: string | null; fase: string; progreso: number; detalle: string }

/**
 * Botón «Instalar con un clic» de una herramienta opcional (app Craft), con su avance. `api` responde
 * GET con el estado y POST para empezar (p. ej. /api/sistema/vectorcraft).
 */
export function InstalarHerramienta({ api, paraQue }: { api: string; paraQue: string }) {
  const [activo, setActivo] = useState(false);
  const { datos: e, recargar } = useSondeo<Estado>(api, activo ? 1000 : 60_000);
  const [error, setError] = useState<string | null>(null);
  const trabajando = !!e && ["descargando", "verificando", "descomprimiendo"].includes(e.fase);

  async function instalar() {
    setError(null);
    setActivo(true);
    try {
      await postJson(api, {});
      await recargar();
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x));
    }
  }

  if (!e) return null;
  if (e.version) return <p className="mt-2 text-xs text-emerald-300">Lista: {e.version}. Recarga la página para ver el chequeo en verde.</p>;
  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-tenue">{paraQue}</p>
      <button type="button" className="boton boton-primario" disabled={trabajando} onClick={() => void instalar()}>
        {trabajando ? "Instalando…" : "Instalar con un clic"}
      </button>
      {trabajando && (
        <div className="space-y-1">
          <div className="h-2 w-64 max-w-full overflow-hidden rounded bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(e.progreso * 100)}>
            <div className="h-full bg-sky-400" style={{ width: `${Math.round(e.progreso * 100)}%` }} />
          </div>
          <p className="text-xs text-tenue" aria-live="polite">{e.detalle}</p>
        </div>
      )}
      {e.fase === "error" && <Aviso tipo="error">No se pudo instalar: {e.detalle}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </div>
  );
}
