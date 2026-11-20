"use client";
/**
 * Aviso para quien no sabe de permisos: si la llave de las cuentas o los datos de acceso de las redes
 * quedaron sin proteger, lo dice en palabras simples y los protege con un botón. No se muestra nada
 * si está todo bien.
 */
import { useState } from "react";
import { Aviso, postJson, useSondeo } from "./comun";

interface ArchivoPrivado {
  id: string;
  nombre: string;
  ruta: string;
  estado: string;
  modo?: string;
  problema: boolean;
  arreglable: boolean;
  mensaje: string;
}

export function AvisoPrivados({ alCambiar }: { alCambiar?: () => void }) {
  const { datos, recargar } = useSondeo<{ archivos: ArchivoPrivado[] }>("/api/sistema/privados", 30_000);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; t: string } | null>(null);

  const problemas = datos?.archivos.filter((a) => a.problema) ?? [];
  if (problemas.length === 0) return resultado?.tipo === "ok" ? <Aviso tipo="ok">{resultado.t}</Aviso> : null;
  const arreglables = problemas.filter((a) => a.arreglable);
  const aMano = problemas.filter((a) => !a.arreglable);

  async function proteger() {
    setOcupado(true);
    setResultado(null);
    try {
      const r = await postJson<{ archivos: ArchivoPrivado[] }>("/api/sistema/privados", {});
      const quedan = r.archivos.filter((a) => a.problema);
      setResultado(quedan.length === 0
        ? { tipo: "ok", t: "Listo: tus datos de acceso quedaron protegidos. Ya puedes conectar cuentas y publicar." }
        : { tipo: "error", t: "Algunos archivos no se pudieron proteger solos: mira el detalle de abajo." });
      await recargar();
      alCambiar?.();
    } catch (e) {
      setResultado({ tipo: "error", t: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-700 bg-amber-950/50 p-4 text-sm" role="alert">
      <p className="font-medium text-amber-100">Tus datos de acceso a las redes no están protegidos</p>
      <p>
        Otras personas o programas de esta computadora podrían usarlos para entrar a tus cuentas. Mientras tanto,
        Geeper no conecta cuentas ni publica.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {problemas.map((a) => <li key={a.id}><span className="font-medium">{a.nombre}:</span> {a.mensaje}</li>)}
      </ul>
      {arreglables.length > 0 && (
        <button type="button" className="boton boton-primario" disabled={ocupado} onClick={() => void proteger()}>
          {ocupado ? "Protegiendo…" : "Protegerlos ahora"}
        </button>
      )}
      {aMano.length > 0 && (
        <p className="text-amber-200">
          {arreglables.length > 0 ? "Lo demás" : "Esto"} no se arregla con un botón, para no proteger el archivo equivocado.
          Pídele ayuda a quien instaló Geeper y muéstrale el detalle técnico.
        </p>
      )}
      {resultado && <Aviso tipo={resultado.tipo}>{resultado.t}</Aviso>}
      <details className="text-xs text-tenue">
        <summary className="cursor-pointer">Detalle técnico</summary>
        <ul className="mt-1 space-y-0.5 font-mono">
          {problemas.map((a) => <li key={a.id}>{a.ruta} · {a.estado}{a.modo ? ` · permisos ${a.modo}` : ""} · debe ser un archivo normal tuyo con permisos 600</li>)}
        </ul>
      </details>
    </div>
  );
}
