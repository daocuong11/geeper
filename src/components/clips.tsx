"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, Barra, Estado, pedir, postJson, useSondeo } from "./comun";

interface Candidato { n: number; inicio: number; fin: number; puntaje: number; motivos: string[]; texto?: string }
interface Fuente {
  id: string;
  info: { url: string; titulo: string; canal: string | null; plataforma: string | null; duracion: number };
  candidatos: Candidato[] | null;
  idioma: string | null;
}
interface TrabajoM { id: string; estado: string; etapa: string; progreso: number; error: string | null; payload: { src?: string }; creado: string }
interface Tendencia { url: string; titulo: string; canal: string; vistas: number; horas: number; vistasPorHora: number; minutos: number; loMasVisto: boolean; fueDirecto: boolean }

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const miles = (n: number) => n.toLocaleString("es");

export function PaginaClips() {
  const { datos, recargar } = useSondeo<{ fuentes: Fuente[]; trabajos: TrabajoM[] }>("/api/clips", 4000);
  const [src, setSrc] = useState("");
  const [idioma, setIdioma] = useState("es");
  const [min, setMin] = useState(15);
  const [max, setMax] = useState(40);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const activos = (datos?.trabajos ?? []).filter((t) => t.estado === "pendiente" || t.estado === "corriendo");
  const fallidos = (datos?.trabajos ?? []).filter((t) => t.estado === "fallido").slice(0, 2);

  async function buscar(e?: React.FormEvent, url?: string) {
    e?.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await postJson("/api/clips/momentos", { src: url ?? src, idioma, min, max });
      if (!url) setSrc("");
      void recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Clips de material largo</h1>
        <p className="text-sm text-tenue">De un VOD, un video publicado o una grabación propia a clips verticales editables. Nunca directos en vivo: espera el VOD.</p>
      </div>

      <form onSubmit={buscar} className="tarjeta space-y-3 p-4">
        <label className="etiqueta" htmlFor="src">URL del video o VOD, o ruta absoluta de un archivo</label>
        <input id="src" className="campo font-mono" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="https://www.youtube.com/watch?v=…  ·  /home/…/grabacion.mp4" required />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="etiqueta" htmlFor="idioma">Idioma de lo que se habla</label>
            <select id="idioma" className="campo" value={idioma} onChange={(e) => setIdioma(e.target.value)}>
              <option value="es">Español</option><option value="en">Inglés</option><option value="pt">Portugués</option>
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="min">Mín. (s)</label>
            <input id="min" type="number" className="campo w-20" value={min} min={3} max={120} onChange={(e) => setMin(Number(e.target.value))} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="max">Máx. (s)</label>
            <input id="max" type="number" className="campo w-20" value={max} min={3} max={180} onChange={(e) => setMax(Number(e.target.value))} />
          </div>
          <button className="boton boton-primario" disabled={enviando || !src.trim()}>{enviando ? "Encolando…" : "Buscar momentos"}</button>
        </div>
        <p className="text-xs text-tenue">Mide el sonido, «lo más visto» de YouTube y el chat (si hubo directo) en segundos; después transcribe sólo los candidatos (CPU, ~15 s cada uno). Lo hace el worker: deja la página abierta o vuelve luego.</p>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </form>

      {activos.map((t) => (
        <div key={t.id} className="tarjeta space-y-2 p-3 text-sm">
          <div className="flex items-center gap-2"><Estado valor={t.estado} /><span className="truncate font-mono text-xs">{t.payload.src}</span></div>
          <p className="text-tenue">{t.etapa || "En cola"}</p>
          <Barra valor={t.progreso} />
        </div>
      ))}
      {fallidos.map((t) => (
        <Aviso key={t.id} tipo="error"><span className="font-mono text-xs">{t.payload.src}</span>: {t.error}</Aviso>
      ))}

      <Radar alElegir={(url) => void buscar(undefined, url)} />

      {(datos?.fuentes ?? []).map((f) => <FuenteCard key={f.id} f={f} />)}
      {datos && datos.fuentes.length === 0 && activos.length === 0 && <p className="text-sm text-tenue">Todavía no hay fuentes.</p>}
    </div>
  );
}

function Radar({ alElegir }: { alElegir: (url: string) => void }) {
  const [q, setQ] = useState("gta 6");
  const [horas, setHoras] = useState(24);
  const [res, setRes] = useState<Tendencia[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function medir(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const r = await pedir<{ videos: Tendencia[] }>(`/api/clips/tendencias?q=${encodeURIComponent(q)}&horas=${horas}`);
      setRes(r.videos);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }
  return (
    <details className="tarjeta p-4">
      <summary className="cursor-pointer text-sm font-medium">Radar de tendencias (YouTube, por vistas por hora)</summary>
      <form onSubmit={medir} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="grow">
          <label className="etiqueta" htmlFor="q">Tema</label>
          <input id="q" className="campo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="horas">Últimas horas</label>
          <input id="horas" type="number" className="campo w-24" value={horas} min={1} max={168} onChange={(e) => setHoras(Number(e.target.value))} />
        </div>
        <button className="boton" disabled={cargando || !q.trim()}>{cargando ? "Midiendo (≈1 min)…" : "Medir"}</button>
      </form>
      {error && <div className="mt-3"><Aviso tipo="error">{error}</Aviso></div>}
      {res && (
        <div className="mt-3 overflow-x-auto">
          {res.length === 0 ? <p className="text-sm text-tenue">Nada subido en ese plazo.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-tenue"><tr><th className="py-1 pr-3">Vistas/h</th><th className="pr-3">Vistas</th><th className="pr-3">Horas</th><th className="pr-3">Min</th><th className="pr-3">Video</th><th /></tr></thead>
              <tbody>
                {res.map((v) => (
                  <tr key={v.url} className="border-t border-[var(--color-borde)]">
                    <td className="py-1 pr-3 tabular-nums">{miles(v.vistasPorHora)}</td>
                    <td className="pr-3 tabular-nums">{miles(v.vistas)}</td>
                    <td className="pr-3 tabular-nums">{v.horas}</td>
                    <td className="pr-3 tabular-nums">{v.minutos}</td>
                    <td className="max-w-md pr-3">
                      <a className="hover:underline" href={v.url} target="_blank" rel="noreferrer">{v.titulo}</a>
                      <span className="text-tenue"> · {v.canal}{v.loMasVisto ? " · con «lo más visto»" : ""}{v.fueDirecto ? " · fue directo" : ""}</span>
                    </td>
                    <td><button type="button" className="boton" onClick={() => alElegir(v.url)}>Buscar momentos</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-tenue">Que un video sea tendencia no da permiso para clipearlo: hace falta la campaña o el permiso del creador.</p>
        </div>
      )}
    </details>
  );
}

function FuenteCard({ f }: { f: Fuente }) {
  return (
    <section className="tarjeta p-4">
      <h2 className="font-medium">{f.info.titulo}</h2>
      <p className="text-xs text-tenue">
        {f.info.canal ?? "archivo propio"} · {mmss(f.info.duracion)} ·{" "}
        {f.info.plataforma === "archivo" ? <span className="font-mono">{f.info.url}</span> : <a className="hover:underline" href={f.info.url} target="_blank" rel="noreferrer">{f.info.url}</a>}
      </p>
      {!f.candidatos ? <p className="mt-2 text-sm text-tenue">Sin candidatos todavía.</p> : f.candidatos.length === 0 ? (
        <p className="mt-2 text-sm text-tenue">No encontré momentos (¿material más corto que la duración mínima?).</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {f.candidatos.map((c) => <CandidatoFila key={c.n} f={f} c={c} />)}
        </ol>
      )}
    </section>
  );
}

function CandidatoFila({ f, c }: { f: Fuente; c: Candidato }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [inicio, setInicio] = useState(c.inicio);
  const [fin, setFin] = useState(c.fin);
  const [encuadre, setEncuadre] = useState("react");
  const [formato, setFormato] = useState("9:16");
  const [gancho, setGancho] = useState("");
  const [titulo, setTitulo] = useState("");
  const [permiso, setPermiso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await postJson<{ proyecto: { id: string } }>("/api/clips", {
        fuenteId: f.id, inicio, fin, encuadre, formato, idioma: f.idioma ?? "es", plantilla: "gta-vi-shorts", gancho, titulo, permiso,
      });
      router.push(`/proyectos/${r.proyecto.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEnviando(false);
    }
  }

  return (
    <li className="rounded-lg border border-[var(--color-borde)] p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-sm">{mmss(c.inicio)}–{mmss(c.fin)}</span>
        <span className="text-xs text-tenue">{(c.fin - c.inicio).toFixed(0)} s · puntaje {c.puntaje} · {c.motivos.join(", ")}</span>
        <button type="button" className="boton ml-auto" onClick={() => setAbierto(!abierto)}>{abierto ? "Cerrar" : "Hacer clip"}</button>
      </div>
      {c.texto && <p className="mt-2 text-sm text-tenue">«{c.texto}»</p>}
      {abierto && (
        <form onSubmit={importar} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="etiqueta">Desde / hasta (s de la fuente)</label>
            <div className="flex gap-2">
              <input type="number" step="0.1" className="campo" value={inicio} onChange={(e) => setInicio(Number(e.target.value))} aria-label="Desde" />
              <input type="number" step="0.1" className="campo" value={fin} onChange={(e) => setFin(Number(e.target.value))} aria-label="Hasta" />
            </div>
          </div>
          <div>
            <label className="etiqueta" htmlFor={`enc-${f.id}-${c.n}`}>Encuadre</label>
            <select id={`enc-${f.id}-${c.n}`} className="campo" value={encuadre} onChange={(e) => setEncuadre(e.target.value)}>
              <option value="react">React: cara arriba, juego abajo</option>
              <option value="cara">Cara: sigue la cara (IRL)</option>
              <option value="contener">Completo con fondo desenfocado</option>
              <option value="cubrir">Recorte al centro</option>
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor={`fmt-${f.id}-${c.n}`}>Formato</label>
            <select id={`fmt-${f.id}-${c.n}`} className="campo" value={formato} onChange={(e) => setFormato(e.target.value)}>
              <option value="9:16">9:16</option><option value="1:1">1:1</option><option value="16:9">16:9</option>
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor={`gan-${f.id}-${c.n}`}>Gancho (primeros 2,6 s)</label>
            <input id={`gan-${f.id}-${c.n}`} className="campo" value={gancho} maxLength={160} onChange={(e) => setGancho(e.target.value)} placeholder="Ni Kai lo vio venir" />
          </div>
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor={`tit-${f.id}-${c.n}`}>Título de reacción (todo el clip, opcional)</label>
            <input id={`tit-${f.id}-${c.n}`} className="campo" value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} placeholder="Kai PIERDE LA CABEZA cuando llega la policía" />
          </div>
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor={`per-${f.id}-${c.n}`}>Permiso del creador (campaña o autorización)</label>
            <input id={`per-${f.id}-${c.n}`} className="campo" value={permiso} maxLength={300} onChange={(e) => setPermiso(e.target.value)} placeholder="Campaña de clipping de Kai en Whop, vista el 2026-11-19" />
            <p className="mt-1 text-xs text-tenue">Sin permiso la licencia queda «revisar» y un proyecto de uso comercial no pasa el QC. No pongas palabras en boca del creador.</p>
          </div>
          {error && <div className="sm:col-span-2"><Aviso tipo="error">{error}</Aviso></div>}
          <div className="sm:col-span-2">
            <button className="boton boton-primario" disabled={enviando || !(fin > inicio)}>{enviando ? "Creando…" : "Crear clip y renderizar"}</button>
          </div>
        </form>
      )}
    </li>
  );
}
