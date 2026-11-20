"use client";
import { useState } from "react";
import { Aviso, postJson, useSondeo } from "./comun";
import { EditorPlantilla, type FilaPlantilla } from "./editor-plantilla";
import { AparienciaPlantilla } from "./apariencia-plantilla";

function Resumen({ p, abierta, alEditar, alDuplicar, alColor }: { p: FilaPlantilla; abierta: boolean; alEditar: () => void; alDuplicar: () => void; alColor: () => void }) {
  const c = p.datos.colores;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex -space-x-1" aria-hidden>
        {[c.acento1, c.acento2, c.activa, c.tinta].map((x, i) => <span key={i} className="h-6 w-6 rounded-full border-2 border-[#141821]" style={{ background: x }} />)}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-medium">{p.nombre}</h2>
        <p className="truncate text-xs text-tenue">
          {p.datos.tipografia.titulos} · {p.usos ? `la usan ${p.usos} proyecto${p.usos === 1 ? "" : "s"}` : "sin proyectos"}{p.datos.descripcion ? ` · ${p.datos.descripcion}` : ""}
        </p>
      </div>
      {!abierta && <button type="button" className="boton boton-primario" onClick={alEditar}>Editar</button>}
      <button type="button" className="boton" onClick={alColor} title="Look de color de los videos y diseño de las portadas">Color y portada</button>
      <button type="button" className="boton" onClick={alDuplicar} title="Crea una copia para probar cambios sin tocar los proyectos que usan ésta">Duplicar</button>
    </div>
  );
}

export function Plantillas() {
  const { datos, recargar } = useSondeo<{ plantillas: FilaPlantilla[] }>("/api/plantillas", 600_000);
  const [abierta, setAbierta] = useState<string | null>(null);
  // «Color y portada» y el editor no se abren a la vez: el editor guarda la plantilla entera desde su copia.
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function duplicar(p: FilaPlantilla) {
    const nombre = prompt("Nombre de la copia:", `${p.nombre} (copia)`);
    if (!nombre?.trim()) return;
    setError(null);
    try {
      const r = await postJson<{ plantilla: { slug: string } }>("/api/plantillas", { nombre: nombre.trim(), base: p.slug });
      await recargar();
      setAbierta(r.plantilla.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Plantillas de canal</h1>
        <p className="text-sm text-tenue">El aspecto de tus videos: marca, logo, colores, letra y cierre. Cambiar una plantilla no toca los videos ya hechos; se aplica cuando vuelves a renderizarlos.</p>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!datos && <p className="text-sm text-tenue">Cargando…</p>}
      {datos?.plantillas.map((p) => (
        <div key={p.slug} className="tarjeta space-y-4 p-4">
          <Resumen p={p} abierta={abierta === p.slug} alEditar={() => { setColor(null); setAbierta(p.slug); }} alDuplicar={() => void duplicar(p)} alColor={() => { setAbierta(null); setColor(color === p.slug ? null : p.slug); }} />
          {abierta === p.slug && <EditorPlantilla key={p.slug} fila={p} alGuardar={() => void recargar()} alCerrar={() => setAbierta(null)} />}
          {color === p.slug && (
            <div className="space-y-3 border-t border-borde pt-4">
              <AparienciaPlantilla slug={p.slug} alCambiar={() => void recargar()} />
              <button type="button" className="boton" onClick={() => setColor(null)}>Cerrar</button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
