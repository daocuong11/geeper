"use client";
import Link from "next/link";
import { useState } from "react";
import { MARCOS, ubicacion } from "@/lib/anuncios/catalogo";
import { Concepto, type Concepto as ConceptoT } from "@/lib/anuncios/esquema";
import { Aviso, Estado, useSondeo } from "../comun";
import type { Ctx } from "./campana";
import { Campo, Chip, Contadores, nuevoId } from "./ui";

/** Palabras por segundo de una voz de locución en español a velocidad 1 (estimación). */
const PALABRAS_POR_SEGUNDO = 2.5;

function nuevo(n: number, principal: ConceptoT["principal"]): ConceptoT {
  return Concepto.parse({ id: nuevoId("c"), nombre: `Concepto ${n}`, principal });
}

export function PestanaConceptos({ ctx }: { ctx: Ctx }) {
  const { datos } = ctx;
  const activo = datos.conceptos.find((c) => c.id === ctx.conceptoActivo) ?? datos.conceptos[0] ?? null;

  function agregar(base?: ConceptoT) {
    const principal = datos.brief.ubicaciones[0] ?? "youtube-shorts";
    const c = base
      ? { ...structuredClone(base), id: nuevoId("c"), nombre: `${base.nombre} (variante)`.slice(0, 80), proyectoId: null }
      : nuevo(datos.conceptos.length + 1, principal);
    ctx.cambiar((d) => ({ ...d, conceptos: [...d.conceptos, c] }));
    ctx.setConceptoActivo(c.id);
  }

  if (!datos.conceptos.length) {
    return (
      <div className="tarjeta mx-auto max-w-xl p-8 text-center">
        <h2 className="text-lg font-semibold">Sin conceptos todavía</h2>
        <p className="mt-2 text-sm text-tenue">
          Un concepto es una idea con su propio gancho, promesa y guion. Haz al menos dos materialmente distintos para poder compararlos: cambiar sólo el formato o unas palabras no cuenta.
        </p>
        <button className="boton boton-primario mt-4" onClick={() => agregar()}>Crear el primer concepto</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
      <aside className="space-y-2">
        <ul className="space-y-2" aria-label="Conceptos">
          {datos.conceptos.map((c) => {
            const r = ctx.revision.conceptos.find((x) => x.conceptoId === c.id);
            const sel = activo?.id === c.id;
            return (
              <li key={c.id}>
                <button
                  onClick={() => ctx.setConceptoActivo(c.id)}
                  aria-current={sel}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${sel ? "border-cyan-700 bg-cyan-950/30" : "border-borde bg-panel hover:border-slate-600"}`}
                >
                  <p className="truncate font-medium">{c.nombre}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-tenue">{c.gancho || "Sin gancho"}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {r && <Contadores r={r.resumen} compacto />}
                    <span className={`text-xs ${c.proyectoId ? "text-emerald-300" : "text-tenue"}`}>{c.proyectoId ? "● video" : "○ sin video"}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <button className="boton w-full justify-center" onClick={() => agregar()} disabled={datos.conceptos.length >= 30}>+ Concepto</button>
      </aside>
      {activo && <Editor key={activo.id} ctx={ctx} c={activo} duplicar={() => agregar(activo)} />}
    </div>
  );
}

function Editor({ ctx, c, duplicar }: { ctx: Ctx; c: ConceptoT; duplicar: () => void }) {
  const { datos } = ctx;
  const set = <K extends keyof ConceptoT>(k: K, v: ConceptoT[K]) =>
    ctx.cambiar((d) => ({ ...d, conceptos: d.conceptos.map((x) => (x.id === c.id ? { ...x, [k]: v } : x)) }));
  const marco = MARCOS[c.marco] ?? MARCOS.ninguno!;
  const palabras = c.guion.trim() ? c.guion.trim().split(/\s+/).length : 0;
  const segundos = palabras / PALABRAS_POR_SEGUNDO;
  const rc = ctx.revision.conceptos.find((x) => x.conceptoId === c.id);
  const ubisBrief = datos.brief.ubicaciones;
  const propias = c.ubicaciones.length ? c.ubicaciones : ubisBrief;

  function quitar() {
    if (!confirm(`¿Quitar el concepto «${c.nombre}»? Su video (si tiene) no se borra.`)) return;
    ctx.cambiar((d) => ({
      ...d,
      conceptos: d.conceptos.filter((x) => x.id !== c.id),
      manuales: Object.fromEntries(Object.entries(d.manuales).filter(([k]) => !k.startsWith(`${c.id}:`))),
    }));
    ctx.setConceptoActivo(null);
  }

  const alternarUbi = (id: ConceptoT["principal"]) => {
    const actual = new Set(propias);
    if (actual.has(id)) actual.delete(id);
    else actual.add(id);
    const lista = ubisBrief.filter((u) => actual.has(u));
    set("ubicaciones", lista.length === ubisBrief.length ? [] : lista);
  };

  return (
    <div className="space-y-4">
      <div className="tarjeta flex flex-wrap items-center gap-3 p-4">
        <input className="campo min-w-0 flex-1 text-base font-semibold" value={c.nombre} maxLength={80} onChange={(e) => set("nombre", e.target.value || "Sin nombre")} aria-label="Nombre del concepto" />
        {rc && <button className="text-left" onClick={() => ctx.irA("revision", c.id)} title="Ver la revisión"><Contadores r={rc.resumen} compacto /></button>}
        <button className="boton" onClick={duplicar} title="Copia para probar otra idea sobre la misma base">Duplicar</button>
        <button className="boton boton-peligro" onClick={quitar}>Quitar</button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <section className="tarjeta space-y-3 p-4">
            <h3 className="font-semibold">La idea</h3>
            <Campo etiqueta="Gancho (lo primero que se ve y se oye)" contador={{ n: c.gancho.length, max: 200 }}>
              <input className="campo" value={c.gancho} maxLength={200} onChange={(e) => set("gancho", e.target.value)} placeholder="¿Qué hace que alguien deje de deslizar sin engañarlo?" />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Insight" ayuda="Lo que sabes de la audiencia y lo hace relevante.">
                <textarea className="campo min-h-20" value={c.insight} maxLength={600} onChange={(e) => set("insight", e.target.value)} />
              </Campo>
              <Campo etiqueta="Promesa" ayuda="Acotada y demostrable.">
                <textarea className="campo min-h-20" value={c.promesa} maxLength={300} onChange={(e) => set("promesa", e.target.value)} />
              </Campo>
            </div>
            <Campo etiqueta="Pruebas que respaldan el concepto">
              {datos.brief.afirmaciones.length === 0 ? (
                <p className="text-sm text-tenue">Agrega afirmaciones con su prueba en el Brief.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {datos.brief.afirmaciones.map((a) => (
                    <Chip key={a.id} activo={c.pruebas.includes(a.id)} onClick={() => set("pruebas", c.pruebas.includes(a.id) ? c.pruebas.filter((x) => x !== a.id) : [...c.pruebas, a.id])} titulo={a.prueba}>
                      <span aria-hidden>{a.aprobada ? "✓" : "⏳"}</span>
                      <span className="max-w-[16rem] truncate">{a.texto || "(sin texto)"}</span>
                    </Chip>
                  ))}
                </div>
              )}
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Narrativa" ayuda="Cómo avanza el video, escena por escena.">
                <textarea className="campo min-h-24" value={c.narrativa} maxLength={1500} onChange={(e) => set("narrativa", e.target.value)} />
              </Campo>
              <Campo etiqueta="Objeciones que responde">
                <textarea className="campo min-h-24" value={c.objeciones} maxLength={600} onChange={(e) => set("objeciones", e.target.value)} />
              </Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Llamado a la acción (lo que se dice)">
                <input className="campo" value={c.cta} maxLength={120} onChange={(e) => set("cta", e.target.value)} placeholder="Pide tu prueba gratis" />
              </Campo>
              <Campo etiqueta="Hipótesis" ayuda="Qué crees que pasará y por qué.">
                <input className="campo" value={c.hipotesis} maxLength={400} onChange={(e) => set("hipotesis", e.target.value)} />
              </Campo>
            </div>
          </section>

          <section className="tarjeta space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Guion</h3>
              <span className="text-xs text-tenue tabular-nums">{palabras} palabras · ~{Math.round(segundos)} s a velocidad 1 (la plantilla puede ir más lenta)</span>
            </div>
            <textarea
              className="campo min-h-48 font-[450] leading-relaxed"
              value={c.guion}
              maxLength={4000}
              onChange={(e) => set("guion", e.target.value)}
              placeholder="Lo que dice la voz, de principio a fin. Geeper se lo pasa a MPT tal cual: abre con el gancho y cierra con el CTA."
              aria-label="Guion"
            />
          </section>
        </div>

        <div className="space-y-4">
          <section className="tarjeta space-y-3 p-4">
            <h3 className="font-semibold">Marco de copy</h3>
            <select className="campo" value={c.marco} onChange={(e) => set("marco", e.target.value as ConceptoT["marco"])} aria-label="Marco de copy">
              {Object.entries(MARCOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
            </select>
            {marco.preguntas.length > 0 ? (
              <>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">{marco.preguntas.map((p) => <li key={p}>{p}</li>)}</ol>
                <p className="rounded-md border border-amber-900/60 bg-amber-950/30 p-2 text-xs text-amber-200"><b>Riesgos:</b> {marco.riesgos}</p>
              </>
            ) : (
              <p className="text-sm text-tenue">Un marco ordena un mensaje ya aprobado; no garantiza que funcione. Es válido no usar ninguno.</p>
            )}
          </section>

          <section className="tarjeta space-y-3 p-4">
            <h3 className="font-semibold">Ubicaciones</h3>
            <Campo etiqueta="Principal (define el formato del video)">
              <select className="campo" value={c.principal} onChange={(e) => set("principal", e.target.value as ConceptoT["principal"])}>
                {(ubisBrief.includes(c.principal) ? ubisBrief : [c.principal, ...ubisBrief]).map((u) => <option key={u} value={u}>{ubicacion(u)?.nombre} · {ubicacion(u)?.formato}</option>)}
              </select>
            </Campo>
            <div className="flex flex-wrap gap-1.5">
              {ubisBrief.map((u) => <Chip key={u} activo={propias.includes(u)} onClick={() => alternarUbi(u)}>{ubicacion(u)?.nombre}</Chip>)}
            </div>
          </section>

          <VideoDelConcepto ctx={ctx} c={c} />
        </div>
      </div>
    </div>
  );
}

interface ProyectoLista { id: string; nombre: string; formato: string; estado: string }

function VideoDelConcepto({ ctx, c }: { ctx: Ctx; c: ConceptoT }) {
  const rc = ctx.revision.conceptos.find((x) => x.conceptoId === c.id);
  const p = rc?.proyecto ?? null;
  const [modo, setModo] = useState<"nada" | "generar" | "vincular">("nada");
  const [acepto, setAcepto] = useState(false);
  const [elegido, setElegido] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const u = ubicacion(c.principal);

  async function correr(cuerpo: Record<string, unknown>): Promise<boolean> {
    setOcupado(true);
    setError(null);
    try {
      await ctx.accion(cuerpo);
      setModo("nada");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="tarjeta space-y-3 p-4">
      <h3 className="font-semibold">Video</h3>
      {c.proyectoId && p ? (
        <>
          <div className="rounded-lg border border-borde bg-[#0f131a] p-3">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/proyectos/${p.id}`} className="font-medium text-acento hover:underline">{p.nombre}</Link>
              <Estado valor={p.estado} />
            </div>
            <p className="mt-1 text-xs text-tenue">{p.formato} · versión {p.versionActual}{p.ocupado ? " · trabajando…" : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/proyectos/${p.id}`} className="boton">Abrir en el editor</Link>
            <button className="boton" disabled={ocupado} onClick={() => confirm("¿Desvincular el video? El proyecto no se borra.") && void correr({ tipo: "vincular", concepto: c.id, proyecto: null })}>Desvincular</button>
          </div>
          <VarianteGancho c={c} ocupado={ocupado} correr={correr} />
        </>
      ) : c.proyectoId ? (
        <Aviso tipo="alerta">
          El proyecto vinculado ya no existe.{" "}
          <button className="underline" onClick={() => void correr({ tipo: "vincular", concepto: c.id, proyecto: null })}>Desvincular</button>
        </Aviso>
      ) : (
        <>
          <p className="text-sm text-tenue">Genera el video con este guion ({u?.formato ?? "9:16"}, para {u?.nombre}) o vincula un proyecto que ya tengas.</p>
          <div className="flex flex-wrap gap-2">
            <button className={`boton ${modo === "generar" ? "boton-primario" : ""}`} onClick={() => setModo(modo === "generar" ? "nada" : "generar")}>Generar video</button>
            <button className={`boton ${modo === "vincular" ? "boton-primario" : ""}`} onClick={() => setModo(modo === "vincular" ? "nada" : "vincular")}>Vincular existente</button>
          </div>
          {modo === "generar" && (
            <div className="space-y-2">
              {c.guion.trim().length < 20 ? (
                <Aviso tipo="alerta">Primero escribe el guion: es lo que va a decir la voz.</Aviso>
              ) : (
                <Aviso tipo="alerta">
                  <p className="font-medium">Generar usa la GPU (imágenes y voz con MPT, unos 3 min).</p>
                  <p className="mt-1">Windows se ha reiniciado sin aviso durante generaciones: guarda tu trabajo antes. Si se corta, el trabajo queda «interrumpido» y lo relanzas desde Trabajos.</p>
                  <label className="mt-2 flex items-center gap-2">
                    <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
                    Guardé mi trabajo; puedo generar.
                  </label>
                </Aviso>
              )}
              <button className="boton boton-primario w-full justify-center" disabled={!acepto || ocupado || c.guion.trim().length < 20} onClick={() => void correr({ tipo: "generar", concepto: c.id })}>
                {ocupado ? "Encolando…" : "Generar con este guion"}
              </button>
            </div>
          )}
          {modo === "vincular" && (
            <div className="space-y-2">
              <SelectorProyecto valor={elegido} onCambio={setElegido} />
              <button className="boton boton-primario w-full justify-center" disabled={!elegido || ocupado} onClick={() => void correr({ tipo: "vincular", concepto: c.id, proyecto: elegido })}>Vincular</button>
            </div>
          )}
        </>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </section>
  );
}

function SelectorProyecto({ valor, onCambio }: { valor: string; onCambio: (id: string) => void }) {
  const { datos } = useSondeo<{ proyectos: ProyectoLista[] }>("/api/proyectos", 15000);
  return (
    <select className="campo" value={valor} onChange={(e) => onCambio(e.target.value)} aria-label="Proyecto a vincular">
      <option value="">{datos ? "Elige un proyecto…" : "Cargando proyectos…"}</option>
      {datos?.proyectos.map((x) => <option key={x.id} value={x.id}>{x.nombre} · {x.formato}</option>)}
    </select>
  );
}

/** El mismo video con otra primera escena: voz nueva en CPU + render, sin GPU. */
function VarianteGancho({ c, ocupado, correr }: { c: ConceptoT; ocupado: boolean; correr: (cuerpo: Record<string, unknown>) => Promise<boolean> }) {
  const [abierto, setAbierto] = useState(false);
  const [gancho, setGancho] = useState("");
  if (!abierto) {
    return (
      <button className="boton w-full justify-center" onClick={() => setAbierto(true)} title="Probar otro gancho sin regenerar el video">
        + Variante de gancho
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-borde bg-[#0f131a] p-3">
      <p className="text-sm font-medium">Variante de gancho</p>
      <p className="text-xs text-tenue">
        Copia el video y cambia sólo lo que dice la primera escena. La voz nueva se hace en CPU y luego se renderiza; no usa la GPU. Se crea un concepto nuevo y, si la prueba está vacía, queda armada (original contra variante).
      </p>
      <textarea className="campo min-h-16" value={gancho} maxLength={300} onChange={(e) => setGancho(e.target.value)} placeholder={c.gancho ? `Distinto de: «${c.gancho}»` : "Nuevo gancho (lo que dice la primera escena)"} aria-label="Nuevo gancho" />
      <div className="flex gap-2">
        <button className="boton boton-primario" disabled={ocupado || gancho.trim().length < 3} onClick={() => void correr({ tipo: "variante", concepto: c.id, gancho }).then((ok) => { if (ok) { setGancho(""); setAbierto(false); } })}>
          {ocupado ? "Creando…" : "Crear variante"}
        </button>
        <button className="boton" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </div>
  );
}
