"use client";
import { useState } from "react";
import { Aviso, Estado, archivo, pedir, postJson, segundos, useSondeo } from "./comun";
import { VistaEnVivo } from "./vista-en-vivo";
import { ListaTrabajos } from "./lista-trabajos";
import { ListaPublicaciones, PanelPublicar, type PublicacionV } from "./panel-publicar";
import { EdicionPorTexto, EfectosEscena, PanelAvanzado, type EfectosV, type ExtrasV, type PalabraV } from "./edicion-avanzada";

interface Grupo {
  texto: string;
  inicio: number;
  fin: number;
  desde: number;
  hasta: number;
  oido: string;
  lineas: number;
  cruza: boolean;
  mostradoPropio: string;
}
interface EscenaV {
  id: string;
  indice: number;
  inicio: number;
  duracion: number;
  duracionOriginal: number;
  texto: string;
  detalle: PalabraV[];
  efectos: EfectosV;
  correcciones: { desde: number; hasta: number; texto: string }[];
  visual: { asset: string; ruta: string; source: string; licencia: string; tipo: string; inicio: number; ajuste: string; ancla: string; prompt: unknown };
  voz: { asset: string; source: string };
  grupos: Grupo[];
}
interface Regla { id: string; nombre: string; ok: boolean; aviso?: boolean; medido: unknown; objetivo: string; detalle?: string }
interface Render {
  id: string;
  versionNumero: number;
  perfil: string;
  ruta: string;
  estado: string;
  duracion: number | null;
  segundos: number | null;
  creado: string;
  informeQc: { aprobado: boolean; reglas: Regla[]; hojaContacto?: string; fotogramas: { t: number; ruta: string; nota: string }[]; master?: string } | null;
}
interface Vista {
  fila: {
    id: string; slug: string; nombre: string; tema: string; formato: string; plantilla: string; estado: string; versionActual: number;
    versiones: { numero: number; nota: string; creado: string }[];
    renders: Render[];
    trabajos: { tipo: string; estado: string }[];
    lote: { nombre: string } | null;
    publicaciones: PublicacionV[];
  };
  p: { voz: { voz: string; velocidad: number }; mostrar: { de: string; a: string }[]; formato: string; plantilla: string } | null;
  escenas: EscenaV[];
  total: number;
  extras: ExtrasV | null;
}

const t2 = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function medido(v: unknown): string {
  if (typeof v === "number") return String(Number(v.toFixed(2)));
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return `${v.length} elementos`;
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x !== "object").map(([k, x]) => `${k}: ${String(x)}`).join(", ");
  return String(v);
}

function InformeQc({ r, slug }: { r: Render; slug: string }) {
  const inf = r.informeQc;
  if (!inf) return null;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
      <table className="w-full min-w-0 table-fixed text-left text-xs">
        <thead className="text-tenue"><tr><th className="py-1 pr-2">Regla</th><th className="pr-2">Medido</th><th>Objetivo</th></tr></thead>
        <tbody>
          {inf.reglas.map((g) => (
            <tr key={g.id} className="border-t border-borde align-top">
              <td className="py-1 pr-2"><span aria-hidden>{g.ok ? "✓" : g.aviso ? "!" : "✗"}</span> <span className={g.ok ? "" : g.aviso ? "text-amber-300" : "text-red-300"}>{g.nombre}</span>
                {g.detalle && !g.ok && <pre className="mt-1 whitespace-pre-wrap text-[11px] text-tenue">{g.detalle}</pre>}</td>
              <td className="pr-2 break-words">{medido(g.medido)}</td>
              <td className="break-all text-tenue">{g.objetivo}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {inf.hojaContacto && (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={archivo(`${slug}/${inf.hojaContacto}`)} alt="Hoja de contacto: fotogramas clave del render" className="w-full rounded border border-borde" />
          <figcaption className="mt-1 text-xs text-tenue">Hoja de contacto: {inf.fotogramas.map((f) => `${f.nota} (${f.t.toFixed(1)} s)`).join(" · ")}</figcaption>
        </figure>
      )}
    </div>
  );
}

function EditorGrupo({ g, onGuardar, onQuitar, corregido }: { g: Grupo; corregido: boolean; onGuardar: (texto: string) => Promise<void>; onQuitar: () => Promise<void> }) {
  const [texto, setTexto] = useState(g.mostradoPropio);
  const [guardando, setGuardando] = useState(false);
  const cambiado = texto.trim() !== g.mostradoPropio;
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-16 shrink-0 font-mono text-xs text-tenue">{g.inicio.toFixed(2)} s</span>
      <input aria-label={`Subtítulo en ${g.inicio.toFixed(2)} s`} className="campo min-w-0 flex-1 py-1" value={texto} onChange={(e) => setTexto(e.target.value)} />
      {cambiado && (
        <button type="button" className="boton boton-primario py-1" disabled={guardando}
          onClick={async () => { setGuardando(true); try { await onGuardar(texto); } finally { setGuardando(false); } }}>Guardar</button>
      )}
      {corregido && !cambiado && <button type="button" className="boton py-1" onClick={() => void onQuitar()} title={`Se oye: «${g.oido}»`}>Deshacer</button>}
      {g.cruza && <span className="text-xs text-tenue">sigue en la escena siguiente</span>}
      {g.oido !== g.mostradoPropio && <span className="w-full pl-[4.5rem] text-xs text-tenue">Se oye: «{g.oido}»</span>}
    </li>
  );
}

function TarjetaEscena({ e, slug, total, editar, subirClip, regenerarVoz, reencuadrar, ocupado }: {
  e: EscenaV; slug: string; total: number; ocupado: boolean;
  editar: (ed: object) => Promise<void>;
  subirClip: (escena: string, f: File) => Promise<void>;
  regenerarVoz: (escena: string) => Promise<void>;
  reencuadrar: (escena: string, layout: string) => Promise<void>;
}) {
  return (
    <li className="tarjeta flex flex-col gap-3 p-3 md:flex-row">
      <div className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/miniatura?p=${slug}&ruta=${encodeURIComponent(e.visual.ruta)}&t=${(e.visual.inicio + 0.5).toFixed(1)}`} alt={`Escena ${e.indice + 1}`}
          className="h-40 w-auto rounded bg-black object-contain md:h-44" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">Escena {e.indice + 1}</h3>
          <span className="font-mono text-xs text-tenue">{t2(e.inicio)} – {t2(e.inicio + e.duracion)} ({e.duracion.toFixed(2)} s)</span>
          <span className="text-xs text-tenue">clip: {e.visual.source}{e.visual.source === "archivo" ? " (propio)" : ""} · voz: {e.voz.source}</span>
        </div>
        <EdicionPorTexto escena={e.id} palabras={e.detalle} duracion={e.duracion} duracionOriginal={e.duracionOriginal} editar={editar} ocupado={ocupado} />
        <ul className="space-y-1.5">
          {e.grupos.map((g) => (
            <EditorGrupo key={`${g.desde}-${g.hasta}-${g.mostradoPropio}`} g={g}
              corregido={e.correcciones.some((c) => c.desde >= g.desde && c.hasta <= g.hasta)}
              onGuardar={(texto) => editar({ tipo: "corregirSubtitulo", escena: e.id, desde: g.desde, hasta: g.hasta, texto })}
              onQuitar={async () => { for (const c of e.correcciones.filter((c) => c.desde >= g.desde && c.hasta <= g.hasta)) await editar({ tipo: "quitarCorreccion", escena: e.id, desde: c.desde }); }} />
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="boton" disabled={ocupado || e.indice === 0} onClick={() => void editar({ tipo: "moverEscena", escena: e.id, a: e.indice - 1 })} aria-label={`Subir escena ${e.indice + 1}`}>↑ Subir</button>
          <button type="button" className="boton" disabled={ocupado || e.indice === total - 1} onClick={() => void editar({ tipo: "moverEscena", escena: e.id, a: e.indice + 1 })} aria-label={`Bajar escena ${e.indice + 1}`}>↓ Bajar</button>
          <label className="boton cursor-pointer">
            Reemplazar clip…
            <input type="file" accept="video/*,image/*" className="sr-only" disabled={ocupado}
              onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void subirClip(e.id, f); ev.target.value = ""; }} />
          </label>
          <select aria-label="Encuadre" className="campo w-auto py-1" value={e.visual.ajuste} disabled={ocupado}
            onChange={(ev) => void editar({ tipo: "ajusteVisual", escena: e.id, ajuste: ev.target.value === "auto" ? undefined : ev.target.value, ancla: e.visual.ancla === "centro" ? undefined : e.visual.ancla })}>
            <option value="auto">Encuadre automático</option>
            <option value="cubrir">Cubrir (recorta)</option>
            <option value="contener">Contener (fondo desenfocado)</option>
          </select>
          {e.visual.tipo === "video" && (
            <select aria-label="Seguir la cara" className="campo w-auto py-1" value="" disabled={ocupado}
              onChange={(ev) => { const l = ev.target.value; ev.target.value = ""; if (l) void reencuadrar(e.id, l); }}>
              <option value="">Seguir la cara (9:16)…</option>
              <option value="react">React: cara arriba, juego abajo</option>
              <option value="cara">Cara a toda la altura</option>
            </select>
          )}
          {e.voz.source !== "archivo" && (
            <button type="button" className="boton" disabled={ocupado} onClick={() => void regenerarVoz(e.id)}>Regenerar voz de la escena</button>
          )}
          <button type="button" className="boton boton-peligro" disabled={ocupado || total <= 1}
            onClick={() => { if (confirm(`¿Quitar la escena ${e.indice + 1}? Se quita también lo que se oye en ella. Puedes volver atrás en el historial.`)) void editar({ tipo: "quitarEscena", escena: e.id }); }}>Quitar</button>
        </div>
        <EfectosEscena escena={e.id} indice={e.indice} efectos={e.efectos} editar={editar} ocupado={ocupado} />
      </div>
    </li>
  );
}

export function EditorProyecto({ id }: { id: string }) {
  const { datos: v, error, recargar } = useSondeo<Vista>(`/api/proyectos/${id}`, 3000);
  const { datos: pl } = useSondeo<{ plantillas: { slug: string; nombre: string }[] }>("/api/plantillas", 60_000);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mostrarTxt, setMostrarTxt] = useState<string | null>(null);
  const [pestana, setPestana] = useState<"vivo" | "render" | null>(null);

  async function hacer(fn: () => Promise<unknown>, ok: string) {
    setOcupado(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tipo: "ok", texto: ok });
      await recargar();
    } catch (e) {
      setMsg({ tipo: "error", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  }
  const editar = (ed: object) => hacer(() => postJson(`/api/proyectos/${id}/editar`, { edicion: ed }), "Guardado como versión nueva. Ya se ve en «En vivo»; renderiza para el QC y la descarga.");
  const subirClip = (escena: string, f: File) => hacer(async () => {
    const fd = new FormData();
    fd.set("escena", escena);
    fd.set("archivo", f);
    await pedir(`/api/proyectos/${id}/clip`, { method: "POST", body: fd });
  }, `Clip reemplazado por «${f.name}».`);
  const reencuadrar = (escena: string, layout: string) => hacer(() => postJson(`/api/proyectos/${id}/reencuadre`, { escena, layout }),
    "Reencuadre en cola (detección de cara en CPU). Al terminar queda como versión nueva; si no encuentra una cara estable, lo dice en Trabajos.");
  const regenerarVoz = (escena: string | null) => hacer(() => postJson(`/api/proyectos/${id}/voz`, { escena }),
    "Voz en cola (Kokoro y whisper en CPU). Al terminar se realinean los subtítulos y se vuelve a renderizar.");
  const renderizar = () => hacer(() => postJson(`/api/proyectos/${id}/render`, {}), "Render en cola: sólo compila y renderiza, no genera nada con la GPU.");
  const alinearMusica = () => hacer(async () => {
    const r = await postJson<{ cambio: boolean; motivo?: string }>(`/api/proyectos/${id}/musica`, {});
    if (!r.cambio) throw new Error(r.motivo ?? "No se pudo alinear la música");
  }, "Música alineada: los pulsos quedan marcados y el QC mide cuántos cortes caen en pulso.");
  const subirLibre = (f: File, pista: string, inicio: number, licencia: string) => hacer(async () => {
    const fd = new FormData();
    fd.set("pista", pista);
    fd.set("inicio", String(inicio));
    fd.set("licencia", licencia);
    fd.set("archivo", f);
    await pedir(`/api/proyectos/${id}/clip`, { method: "POST", body: fd });
  }, `«${f.name}» agregado en ${inicio.toFixed(1)} s.`);

  if (error && !v) return <Aviso tipo="error">{error}</Aviso>;
  if (!v) return <p className="text-tenue">Cargando…</p>;
  const { fila, p, escenas } = v;
  const render = fila.renders[0];
  // Por defecto: el render si está al día; si hay cambios sin renderizar, la vista en vivo.
  const modo = pestana ?? (render && render.versionNumero === fila.versionActual ? "render" : "vivo");
  const activos = fila.trabajos.filter((t) => t.estado === "pendiente" || t.estado === "corriendo");
  const textoMostrar = mostrarTxt ?? (p?.mostrar ?? []).map((m) => `${m.de}=${m.a}`).join("\n");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{fila.nombre}</h1>
          <p className="text-sm text-tenue">{fila.tema !== fila.nombre ? `${fila.tema} · ` : ""}versión {fila.versionActual} · {escenas.length} escenas · {segundos(v.total)}{fila.lote ? ` · ${fila.lote.nombre}` : ""}</p>
          {v.extras?.clip && (
            <p className="text-xs text-tenue">
              Clip de <a className="hover:underline" href={v.extras.clip.url} target="_blank" rel="noreferrer">{v.extras.clip.titulo}</a>
              {v.extras.clip.canal ? ` (${v.extras.clip.canal})` : ""} · {Math.floor(v.extras.clip.inicio)}–{Math.ceil(v.extras.clip.fin)} s · encuadre {v.extras.clip.encuadre}
              {v.extras.clip.reencuadre ? ` · ${v.extras.clip.reencuadre}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Estado valor={fila.estado} />
          <button type="button" className="boton boton-primario" disabled={ocupado || !p} onClick={() => void renderizar()}>Renderizar (sin GPU para generar)</button>
        </div>
      </header>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      {activos.length > 0 && <Aviso tipo="info">Hay {activos.length} trabajo(s) en curso para este proyecto; abajo ves su avance y su log.</Aviso>}
      {!p && <Aviso tipo="info">Todavía no hay geeper.json: el proyecto se está generando o importando.</Aviso>}

      {p && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="tarjeta space-y-3 p-4">
            <div className="flex items-center gap-2">
              <h2 className="font-medium">Vista previa</h2>
              <div className="ml-auto flex gap-1 text-sm" role="tablist" aria-label="Qué ver">
                {(["vivo", "render"] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={modo === m}
                    className={`rounded px-2 py-1 ${modo === m ? "bg-white/15" : "text-tenue hover:bg-white/5"}`}
                    onClick={() => setPestana(m)}>
                    {m === "vivo" ? "En vivo" : "Último render"}
                  </button>
                ))}
              </div>
            </div>
            {modo === "vivo" ? <VistaEnVivo proyectoId={id} version={fila.versionActual} /> : render ? (
              <>
                <video key={render.id} src={archivo(`${fila.slug}/${render.ruta}`)} controls preload="metadata"
                  className={`mx-auto max-h-[70vh] w-full rounded bg-black ${render.perfil === "shorts-9x16" ? "max-w-sm" : ""}`} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Estado valor={render.estado} />
                  <span className="text-tenue">v{render.versionNumero} · {render.perfil} · {segundos(render.duracion)} · render en {segundos(render.segundos)}</span>
                  {render.versionNumero !== fila.versionActual && <span className="text-amber-300">Hay cambios sin renderizar</span>}
                  {render.estado === "aprobado"
                    ? <>
                        <a className="boton ml-auto" href={archivo(`${fila.slug}/${render.ruta}`, true)}>Descargar MP4</a>
                        <a className="boton" title="Para subirlos junto al video (accesibilidad y búsqueda)"
                          href={archivo(`${fila.slug}/${render.ruta.replace(/\.mp4$/, ".srt")}`, true)}>Subtítulos (.srt)</a>
                        {render.informeQc?.master && <a className="boton" href={archivo(`${fila.slug}/${render.informeQc.master}`, true)}>Máster (.mov)</a>}
                      </>
                    : <span className="ml-auto text-xs text-red-300">No se descarga: no pasó el QC</span>}
                </div>
              </>
            ) : <p className="text-sm text-tenue">Sin render todavía.</p>}
          </div>
          <div className="tarjeta space-y-4 p-4">
            <h2 className="font-medium">Ajustes (sólo cambian geeper.json)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="etiqueta" htmlFor="formato">Formato</label>
                <select id="formato" className="campo" value={p.formato} disabled={ocupado} onChange={(e) => void editar({ tipo: "cambiarFormato", formato: e.target.value })}>
                  <option value="9:16">9:16 (Shorts)</option><option value="16:9">16:9 (YouTube)</option><option value="1:1">1:1 (cuadrado)</option>
                </select>
              </div>
              <div>
                <label className="etiqueta" htmlFor="plant">Plantilla</label>
                <select id="plant" className="campo" value={p.plantilla} disabled={ocupado} onChange={(e) => void editar({ tipo: "cambiarPlantilla", plantilla: e.target.value })}>
                  {pl?.plantillas.map((x) => <option key={x.slug} value={x.slug}>{x.nombre}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="etiqueta" htmlFor="mostrar">Mostrar en pantalla otra cosa que la que se oye (una regla por línea: <code>GTA seis=GTA VI</code>)</label>
              <textarea id="mostrar" className="campo min-h-16 font-mono" value={textoMostrar} onChange={(e) => setMostrarTxt(e.target.value)} />
              {mostrarTxt !== null && (
                <button type="button" className="boton mt-2" disabled={ocupado} onClick={() => void editar({
                  tipo: "cambiarMostrar",
                  mostrar: mostrarTxt.split("\n").map((l) => l.split("=")).filter((x) => x.length === 2 && x[0]!.trim() && x[1]!.trim()).map(([de, a]) => ({ de: de!.trim(), a: a!.trim() })),
                }).then(() => setMostrarTxt(null))}>Guardar reglas</button>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-borde pt-3">
              <div>
                <label className="etiqueta" htmlFor="vel">Velocidad de la voz (para la próxima regeneración)</label>
                <select id="vel" className="campo w-auto" value={String(p.voz.velocidad)} disabled={ocupado}
                  onChange={(e) => void editar({ tipo: "cambiarVoz", velocidad: Number(e.target.value) })}>
                  {[0.85, 0.9, 0.95, 1, 1.05].map((x) => <option key={x} value={String(x)}>{x}</option>)}
                </select>
              </div>
              <button type="button" className="boton" disabled={ocupado || Boolean(v.extras?.clip)} title={v.extras?.clip ? "Es un clip: la voz es la del creador" : undefined} onClick={() => { if (confirm("¿Regenerar la voz de todo el guion? Se realinean los subtítulos y se vuelve a renderizar. No usa la GPU.")) void regenerarVoz(null); }}>
                Regenerar voz del guion completo
              </button>
            </div>
          </div>
        </section>
      )}

      {p && v.extras && (
        <PanelAvanzado extras={v.extras} formato={p.formato} total={v.total} editar={editar} alinearMusica={alinearMusica} subirLibre={subirLibre} ocupado={ocupado} />
      )}

      {render?.estado === "aprobado" ? (
        <PanelPublicar proyectoId={id} render={render} nombre={fila.nombre} tema={v.extras?.clip?.descripcion || fila.tema} publicaciones={fila.publicaciones} alCambiar={() => void recargar()} />
      ) : fila.publicaciones.length > 0 && (
        <section className="tarjeta space-y-2 p-4">
          <h2 className="font-medium">Publicaciones de este proyecto</h2>
          <p className="text-xs text-tenue">El último render no está aprobado: para publicar otra vez, renderiza y pasa el QC.</p>
          <ListaPublicaciones publicaciones={fila.publicaciones} alCambiar={() => void recargar()} />
        </section>
      )}

      {render?.informeQc && (
        <section className="tarjeta p-4">
          <h2 className="mb-3 font-medium">Control de calidad del último render {render.informeQc.aprobado ? "(aprobado)" : "(no aprobado)"}</h2>
          <InformeQc r={render} slug={fila.slug} />
        </section>
      )}

      {escenas.length > 0 && (
        <section>
          <h2 className="mb-3 font-medium">Escenas</h2>
          <ol className="space-y-3">
            {escenas.map((e) => (
              <TarjetaEscena key={e.id} e={e} slug={fila.slug} total={escenas.length} editar={editar} subirClip={subirClip} regenerarVoz={regenerarVoz} reencuadrar={reencuadrar} ocupado={ocupado} />
            ))}
          </ol>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="tarjeta p-4">
          <h2 className="mb-2 font-medium">Historial</h2>
          <ul className="max-h-80 space-y-1 overflow-auto text-sm">
            {fila.versiones.map((x) => (
              <li key={x.numero} className="flex items-center gap-2">
                <span className="w-10 font-mono text-tenue">v{x.numero}</span>
                <span className="flex-1">{x.nota}</span>
                <span className="text-xs text-tenue">{new Date(x.creado).toLocaleString("es-MX")}</span>
                {x.numero !== fila.versionActual && (
                  <button type="button" className="boton py-0.5 text-xs" disabled={ocupado}
                    onClick={() => void hacer(() => postJson(`/api/proyectos/${id}/version`, { numero: x.numero }), `Volviste a la versión ${x.numero} (guardada como versión nueva).`)}>Volver a esta</button>
                )}
              </li>
            ))}
          </ul>
          {fila.renders.length > 1 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-medium">Renders anteriores</h3>
              <ul className="space-y-1 text-sm">
                {fila.renders.slice(1).map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <Estado valor={r.estado} /><span className="text-tenue">v{r.versionNumero} · {r.perfil}</span>
                    <a className="ml-auto text-acento hover:underline" href={archivo(`${fila.slug}/${r.ruta}`)}>Ver</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          <h2 className="mb-2 font-medium">Trabajos de este proyecto</h2>
          <ListaTrabajos proyectoId={id} />
        </div>
      </section>
    </div>
  );
}

