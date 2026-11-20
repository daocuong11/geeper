"use client";
import { QUE_NO_LLEGA } from "@/lib/que-no-llega";

/** «Terminar en otro editor»: descarga el paquete (.otio + .srt + guía) para FilmCraft o DaVinci Resolve. */
export function PanelOtroEditor({ proyectoId, version }: { proyectoId: string; version: number }) {
  return (
    <section className="tarjeta space-y-3 p-4" aria-labelledby="otro-editor">
      <h2 id="otro-editor" className="font-medium">Terminar en otro editor</h2>
      <p className="text-sm">
        Para retocar el video a mano en un editor profesional. El paquete trae las escenas, la voz, la música y los
        subtítulos en su lugar, y una guía paso a paso para abrirlo en <strong>FilmCraft</strong> o en{" "}
        <strong>DaVinci Resolve</strong>, los dos gratis.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a className="boton" href={`/api/proyectos/${proyectoId}/editor`} download>Descargar paquete (.zip)</a>
        <span className="text-xs text-tenue">Usa la versión actual (v{version}), aunque no esté renderizada.</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-tenue hover:text-inherit">Lo que no llega al otro editor</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {QUE_NO_LLEGA.map((x) => <li key={x}>{x}</li>)}
        </ul>
      </details>
      <p className="text-xs text-tenue">
        Lo que cambies allí no vuelve a Geeper. ¿No tienes editor?{" "}
        <a className="underline" href="https://getartcraft.com/apps/filmcraft" target="_blank" rel="noreferrer">FilmCraft</a>{" "}o{" "}
        <a className="underline" href="https://www.blackmagicdesign.com/products/davinciresolve" target="_blank" rel="noreferrer">DaVinci Resolve</a>.
      </p>
    </section>
  );
}
