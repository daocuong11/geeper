"use client";
import Link from "next/link";
import { QUE_NO_LLEGA } from "@/lib/que-no-llega";

/** «Terminar en otro editor»: abre el proyecto en FilmCraft (la de Media), ya cargado. */
export function PanelOtroEditor({ proyectoId, version }: { proyectoId: string; version: number }) {
  return (
    <section className="tarjeta space-y-3 p-4" aria-labelledby="otro-editor">
      <h2 id="otro-editor" className="font-medium">Terminar en otro editor</h2>
      <p className="text-sm">
        Para retocar el video a mano en <strong>FilmCraft</strong>, el editor de video de Media: se abre aquí mismo con
        las escenas, la voz, la música y los subtítulos en su lugar. Si no está instalado, se instala en un paso.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link className="boton boton-primario" href={`/proyectos/${proyectoId}/filmcraft`}>Abrir en FilmCraft</Link>
        <span className="text-xs text-tenue">Usa la versión actual (v{version}), aunque no esté renderizada.</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-tenue hover:text-inherit">Lo que no llega al otro editor</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {QUE_NO_LLEGA.map((x) => <li key={x}>{x}</li>)}
        </ul>
      </details>
      <p className="text-xs text-tenue">
        Lo que guardes o exportes en FilmCraft queda en la carpeta del proyecto (editor/), pero no cambia el proyecto de
        Geeper. ¿Usas DaVinci Resolve?{" "}
        <a className="underline" href={`/api/proyectos/${proyectoId}/editor`} download>Descarga el paquete para Resolve</a>.
      </p>
    </section>
  );
}
