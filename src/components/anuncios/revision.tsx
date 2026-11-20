"use client";
import Link from "next/link";
import { useState } from "react";
import type { ResultadoChequeo } from "@/lib/anuncios/esquema";
import type { Chequeo, RevisionConcepto } from "@/lib/anuncios/revision";
import { Aviso } from "../comun";
import type { Ctx } from "./campana";
import { BarraResumen, Contadores, NOMBRE_RESULTADO, Resultado, hoy } from "./ui";

const pendiente = (c: Chequeo) => c.estado === "fail" || c.estado === "unknown";

export function PestanaRevision({ ctx }: { ctx: Ctx }) {
  const [soloPendiente, setSoloPendiente] = useState(false);
  const { revision } = ctx;
  if (!revision.conceptos.length) {
    return (
      <div className="tarjeta mx-auto max-w-xl p-8 text-center">
        <p className="text-tenue">La revisión se arma con los conceptos y sus videos.</p>
        <button className="boton boton-primario mt-4" onClick={() => ctx.irA("conceptos")}>Ir a Conceptos</button>
      </div>
    );
  }
  const orden = ctx.conceptoActivo ? [...revision.conceptos].sort((a, b) => Number(b.conceptoId === ctx.conceptoActivo) - Number(a.conceptoId === ctx.conceptoActivo)) : revision.conceptos;
  return (
    <div className="space-y-4">
      <div className="tarjeta flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm">
            Cada chequeo <b>pasa</b>, <b>falla</b> o queda <b>sin saber</b>, con su evidencia. «Sin saber» es una respuesta válida: falta un dato o una verificación, y no se adivina.
          </p>
          <BarraResumen r={revision.resumen} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloPendiente} onChange={(e) => setSoloPendiente(e.target.checked)} />
          Sólo lo pendiente
        </label>
      </div>
      {orden.map((rc) => <TarjetaConcepto key={rc.conceptoId} ctx={ctx} rc={rc} soloPendiente={soloPendiente} />)}
    </div>
  );
}

function TarjetaConcepto({ ctx, rc, soloPendiente }: { ctx: Ctx; rc: RevisionConcepto; soloPendiente: boolean }) {
  const [celda, setCelda] = useState<{ u: string; ch: string } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: React.ReactNode } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const listoYa = rc.resumen.fail === 0 && rc.resumen.unknown === 0;

  async function arreglar(ch: Chequeo) {
    if (!ch.arreglo) return;
    const formato = ch.arreglo.startsWith("formato:") ? ch.arreglo.slice(8) : undefined;
    if (formato && !confirm(`Cambiar el formato del video a ${formato} hace que las ubicaciones de otro formato dejen de pasar. Para tener los dos, duplica el concepto y vincula otro video. ¿Seguir?`)) return;
    setTrabajando(true);
    setAviso(null);
    try {
      const r = (await ctx.accion({ tipo: "preparar", concepto: rc.conceptoId, formato })) as { version: number | null; cambios: string[] };
      setAviso({
        tipo: "ok",
        texto: r.version ? (
          <>Versión {r.version} del proyecto: {r.cambios.join(", ")}. <Link className="underline" href={`/proyectos/${rc.proyecto?.id}`}>Renderízala en el editor</Link> para que el QC lo mida.</>
        ) : "El proyecto ya estaba así.",
      });
    } catch (e) {
      setAviso({ tipo: "error", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setTrabajando(false);
    }
  }

  const filtrar = (cs: Chequeo[]) => (soloPendiente ? cs.filter(pendiente) : cs);
  const idsUbi = rc.ubicaciones[0]?.chequeos.map((c) => ({ id: c.id, nombre: c.nombre })) ?? [];
  const filasUbi = soloPendiente ? idsUbi.filter((f) => rc.ubicaciones.some((u) => u.chequeos.some((c) => c.id === f.id && pendiente(c)))) : idsUbi;
  const sel = celda ? rc.ubicaciones.find((u) => u.ubicacion.id === celda.u)?.chequeos.find((c) => c.id === celda.ch) : undefined;
  const selUbi = celda ? rc.ubicaciones.find((u) => u.ubicacion.id === celda.u)?.ubicacion : undefined;

  return (
    <section className="tarjeta overflow-hidden" aria-labelledby={`rev-${rc.conceptoId}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde p-4">
        <div className="min-w-0">
          <h3 id={`rev-${rc.conceptoId}`} className="font-semibold">{rc.nombre}</h3>
          <p className="text-xs text-tenue">
            {rc.proyecto ? <Link className="hover:underline" href={`/proyectos/${rc.proyecto.id}`}>{rc.proyecto.nombre}</Link> : "Sin video"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Contadores r={rc.resumen} compacto />
          {listoYa ? <span className="rounded-md bg-emerald-800 px-2 py-0.5 text-xs font-semibold text-emerald-50">Listo</span> : null}
          <button className="boton" onClick={() => ctx.irA("conceptos", rc.conceptoId)}>Editar</button>
        </div>
      </header>
      <div className="grid gap-0 lg:grid-cols-2">
        <Lista titulo="Copy" chequeos={filtrar(rc.copy)} />
        <Lista titulo="Video" chequeos={filtrar(rc.video)} arreglar={arreglar} trabajando={trabajando} ctx={ctx} />
      </div>
      {aviso && <div className="px-4 pb-3"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}

      {rc.ubicaciones.length > 0 && filasUbi.length > 0 && (
        <div className="border-t border-borde p-4">
          <h4 className="mb-2 text-sm font-semibold">Por ubicación</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-panel py-1.5 pr-3 text-left font-normal text-tenue">Chequeo</th>
                  {rc.ubicaciones.map((u) => (
                    <th key={u.ubicacion.id} className="px-2 py-1.5 text-center text-xs font-medium text-slate-300">
                      {u.ubicacion.nombre}<span className="block font-normal text-tenue">{u.ubicacion.formato}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasUbi.map((f) => (
                  <tr key={f.id}>
                    <th scope="row" className="sticky left-0 border-t border-borde bg-panel py-1.5 pr-3 text-left font-normal">{f.nombre.replace(/ \(categoría.*\)$/, "")}</th>
                    {rc.ubicaciones.map((u) => {
                      const ch = u.chequeos.find((c) => c.id === f.id)!;
                      const activa = celda?.u === u.ubicacion.id && celda.ch === f.id;
                      return (
                        <td key={u.ubicacion.id} className="border-t border-borde px-2 py-1.5 text-center">
                          <button
                            onClick={() => setCelda(activa ? null : { u: u.ubicacion.id, ch: f.id })}
                            className={`rounded-md p-0.5 ${activa ? "ring-2 ring-cyan-500" : "hover:ring-1 hover:ring-slate-500"}`}
                            aria-label={`${f.nombre} en ${u.ubicacion.nombre}: ${NOMBRE_RESULTADO[ch.estado]}${ch.clave ? " (editable)" : ""}`}
                            aria-expanded={activa}
                          >
                            <Resultado valor={ch.estado} corto />
                            {ch.clave && <span className="sr-only">editable</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-tenue">Toca una celda para ver la evidencia. Las verificaciones manuales se marcan ahí.</p>
          {sel && selUbi && (
            <Detalle key={`${celda!.u}:${celda!.ch}`} ctx={ctx} ch={sel} titulo={`${sel.nombre} · ${selUbi.nombre}`} arreglar={arreglar} trabajando={trabajando} />
          )}
        </div>
      )}
    </section>
  );
}

function Lista({ titulo, chequeos, arreglar, trabajando, ctx }: { titulo: string; chequeos: Chequeo[]; arreglar?: (c: Chequeo) => void; trabajando?: boolean; ctx?: Ctx }) {
  return (
    <div className="p-4 lg:border-r lg:border-borde lg:last:border-r-0">
      <h4 className="mb-2 text-sm font-semibold">{titulo}</h4>
      {chequeos.length === 0 ? (
        <p className="text-sm text-tenue">Nada pendiente.</p>
      ) : (
        <ul className="space-y-2.5">
          {chequeos.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Resultado valor={c.estado} corto />
              <div className="min-w-0 text-sm">
                <p className="font-medium">{c.nombre}</p>
                <p className="text-tenue">{c.evidencia}</p>
                {c.accion && pendiente(c) && <p className="mt-0.5 text-slate-300">→ {c.accion}</p>}
                {c.arreglo && arreglar && pendiente(c) && (
                  <button className="boton mt-1.5" disabled={trabajando} onClick={() => arreglar(c)}>
                    {c.arreglo === "preparar" ? "Preparar el proyecto para anuncio" : `Pasar a ${c.arreglo.slice(8)}`}
                  </button>
                )}
                {c.clave && ctx && <EditorManual ctx={ctx} ch={c} compacto />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Detalle({ ctx, ch, titulo, arreglar, trabajando }: { ctx: Ctx; ch: Chequeo; titulo: string; arreglar: (c: Chequeo) => void; trabajando: boolean }) {
  return (
    <div className="mt-3 rounded-lg border border-cyan-900 bg-[#0f131a] p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{titulo}</p>
        <Resultado valor={ch.estado} />
      </div>
      <p className="mt-1 text-tenue">{ch.evidencia}</p>
      {ch.accion && pendiente(ch) && <p className="mt-1 text-slate-300">→ {ch.accion}</p>}
      {ch.fuente && (
        <a href={ch.fuente} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-acento hover:underline">Abrir la fuente oficial ↗</a>
      )}
      {ch.arreglo && pendiente(ch) && (
        <div className="mt-2">
          <button className="boton" disabled={trabajando} onClick={() => arreglar(ch)}>
            {ch.arreglo === "preparar" ? "Preparar el proyecto para anuncio" : `Pasar a ${ch.arreglo.slice(8)}`}
          </button>
        </div>
      )}
      {ch.clave && <EditorManual ctx={ctx} ch={ch} />}
    </div>
  );
}

const OPCIONES: ResultadoChequeo[] = ["pass", "fail", "unknown", "not_applicable"];

/** Lo marca la persona: estado, evidencia (qué vio, dónde) y fecha. */
function EditorManual({ ctx, ch, compacto = false }: { ctx: Ctx; ch: Chequeo; compacto?: boolean }) {
  const clave = ch.clave!;
  const m = ctx.datos.manuales[clave];
  const guardar = (cambio: Partial<{ estado: ResultadoChequeo; evidencia: string }>) =>
    ctx.cambiar((d) => {
      const actual = d.manuales[clave] ?? { estado: "unknown" as ResultadoChequeo, evidencia: "", fecha: "" };
      const nuevo = { ...actual, ...cambio, fecha: hoy() };
      const manuales = { ...d.manuales };
      if (nuevo.estado === "unknown" && !nuevo.evidencia.trim()) delete manuales[clave];
      else manuales[clave] = nuevo;
      return { ...d, manuales };
    });
  return (
    <div className={compacto ? "mt-1.5 space-y-1.5" : "mt-3 space-y-2 border-t border-borde pt-3"}>
      <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-borde" role="radiogroup" aria-label="Resultado de la verificación">
        {OPCIONES.map((o) => (
          <button
            key={o}
            role="radio"
            aria-checked={(m?.estado ?? "unknown") === o}
            onClick={() => guardar({ estado: o })}
            className={`px-2.5 py-1 text-xs ${(m?.estado ?? "unknown") === o ? "bg-cyan-900 text-white" : "bg-[#0f131a] text-tenue hover:text-white"}`}
          >
            {NOMBRE_RESULTADO[o]}
          </button>
        ))}
      </div>
      <input
        className="campo text-sm"
        placeholder="Evidencia: qué viste y dónde (enlace a la vista previa, captura, página consultada)"
        value={m?.evidencia ?? ""}
        maxLength={500}
        onChange={(e) => guardar({ evidencia: e.target.value })}
        aria-label="Evidencia"
      />
      {m?.fecha && <p className="text-xs text-tenue">Anotado el {m.fecha}</p>}
    </div>
  );
}
