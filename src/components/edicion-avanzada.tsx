"use client";
/**
 * Edición avanzada (esquema v2): edición por texto, efectos del plano de cada escena, destino del video,
 * música al ritmo, textos superpuestos y pistas libres. Todo son ediciones de geeper.json (sin GPU).
 */
import { useState } from "react";
import { segundos } from "./comun";

export type Motivo = "palabras" | "silencio" | "muletilla";

export interface PalabraV {
  texto: string;
  confianza: number | null;
  dudosa: boolean;
  recorte: Motivo | null;
}

export interface EfectosV {
  transicion: { tipo: string; duracion: number } | null;
  movimiento: { desde: { escala: number; x: number; y: number }; hasta: { escala: number; x: number; y: number } } | null;
  velocidad: number;
  color: { brillo: number; contraste: number; saturacion: number } | null;
}

export interface ExtrasV {
  /** Si el proyecto es un clip de material ajeno: de dónde salió y la descripción sugerida del post. */
  clip?: {
    url: string; titulo: string; canal: string | null; inicio: number; fin: number; encuadre: string; reencuadre?: string;
    credito: string; descripcion: string; campania?: { nombre?: string } | null;
  } | null;
  destino: { comercial: boolean; plataformas: string[]; master: boolean; marca: boolean };
  textos: { id: string; texto: string; inicio: number; duracion: number; estilo: string; posicion: string }[];
  libres: { id: string; tipo: "video" | "audio"; clips: { id: string; asset: string; ruta: string; inicio: number; duracion: number }[] }[];
  musica: { inicio: number; pulsos: number } | null;
  confianza: { medidas: number; dudosas: number; proporcion: number };
}

type Editar = (ed: object) => Promise<void>;

const MOTIVOS: Record<Motivo, string> = { palabras: "recortada", silencio: "silencio acortado", muletilla: "muletilla" };

/** Palabras de una escena: se seleccionan con clic (Mayús+clic extiende) y se recortan o restauran. */
export function EdicionPorTexto({ escena, palabras, duracion, duracionOriginal, editar, ocupado }: {
  escena: string; palabras: PalabraV[]; duracion: number; duracionOriginal: number; editar: Editar; ocupado: boolean;
}) {
  const [sel, setSel] = useState<[number, number] | null>(null);
  const elegir = (i: number, extender: boolean) => {
    if (extender && sel) setSel([Math.min(sel[0], i), Math.max(sel[1], i + 1)]);
    else setSel(sel && sel[0] === i && sel[1] === i + 1 ? null : [i, i + 1]);
  };
  const recortadas = sel ? palabras.slice(sel[0], sel[1]).every((w) => w.recorte) : false;
  const dudosas = palabras.filter((w) => w.dudosa).length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-tenue">
        Edición por texto: haz clic en una palabra (Mayús+clic para un tramo) y recórtala: se quita lo que se oye y su tiempo.
        {duracionOriginal - duracion > 0.05 && <> Recortado: {(duracionOriginal - duracion).toFixed(2)} s.</>}
        {dudosas > 0 && <span className="text-amber-300"> {dudosas} palabra(s) con tiempos dudosos (subrayadas): revisa antes de recortar ahí.</span>}
      </p>
      <p className="flex flex-wrap gap-1 text-sm leading-relaxed" aria-label="Palabras de la escena">
        {palabras.map((w, i) => {
          const elegida = sel && i >= sel[0] && i < sel[1];
          return (
            <button key={i} type="button" disabled={ocupado}
              onClick={(ev) => elegir(i, ev.shiftKey)}
              aria-pressed={Boolean(elegida)}
              title={[w.recorte ? MOTIVOS[w.recorte] : null, w.confianza !== null ? `confianza ${Math.round(w.confianza * 100)} %` : null].filter(Boolean).join(" · ") || undefined}
              className={[
                "rounded px-1",
                elegida ? "bg-sky-700 text-white" : "hover:bg-white/10",
                w.recorte ? "text-tenue line-through" : "",
                w.dudosa ? "underline decoration-amber-400 decoration-wavy" : "",
              ].join(" ")}>
              {w.texto}
            </button>
          );
        })}
      </p>
      {sel && (
        <div className="flex flex-wrap gap-2">
          {recortadas
            ? <button type="button" className="boton py-1" disabled={ocupado} onClick={() => void editar({ tipo: "restaurarPalabras", escena, desde: sel[0], hasta: sel[1] }).then(() => setSel(null))}>Restaurar</button>
            : <button type="button" className="boton boton-peligro py-1" disabled={ocupado} onClick={() => void editar({ tipo: "recortarPalabras", escena, desde: sel[0], hasta: sel[1] }).then(() => setSel(null))}>Recortar «{palabras.slice(sel[0], sel[1]).map((w) => w.texto).join(" ")}»</button>}
          <button type="button" className="boton py-1" onClick={() => setSel(null)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

const MOVIMIENTOS: Record<string, EfectosV["movimiento"]> = {
  ninguno: null,
  acercar: { desde: { escala: 1, x: 0, y: 0 }, hasta: { escala: 1.15, x: 0, y: 0 } },
  alejar: { desde: { escala: 1.15, x: 0, y: 0 }, hasta: { escala: 1, x: 0, y: 0 } },
  "izquierda-derecha": { desde: { escala: 1.15, x: -0.12, y: 0 }, hasta: { escala: 1.15, x: 0.12, y: 0 } },
  "derecha-izquierda": { desde: { escala: 1.15, x: 0.12, y: 0 }, hasta: { escala: 1.15, x: -0.12, y: 0 } },
};
const COLORES: Record<string, EfectosV["color"]> = {
  natural: null,
  vivo: { brillo: 1, contraste: 1.08, saturacion: 1.25 },
  claro: { brillo: 1.12, contraste: 1, saturacion: 1 },
  apagado: { brillo: 0.95, contraste: 0.95, saturacion: 0.75 },
  "blanco-negro": { brillo: 1, contraste: 1.1, saturacion: 0 },
};
const clave = <T,>(tabla: Record<string, T>, v: T) => Object.entries(tabla).find(([, x]) => JSON.stringify(x) === JSON.stringify(v))?.[0] ?? "personalizado";

/** Transición de entrada, movimiento de cámara, velocidad y color del plano de una escena. */
export function EfectosEscena({ escena, indice, efectos, editar, ocupado }: { escena: string; indice: number; efectos: EfectosV; editar: Editar; ocupado: boolean }) {
  const mov = clave(MOVIMIENTOS, efectos.movimiento);
  const col = clave(COLORES, efectos.color);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-tenue">Efectos del plano</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="etiqueta">Entrada
          <select className="campo py-1" disabled={ocupado || indice === 0} value={efectos.transicion?.tipo ?? "plantilla"}
            onChange={(ev) => void editar({ tipo: "efectosVisual", escena, transicion: ev.target.value === "plantilla" ? null : { tipo: ev.target.value, duracion: 0.4 } })}>
            <option value="plantilla">{indice === 0 ? "Inicio del video" : "La de la plantilla (golpe de zoom)"}</option>
            <option value="corte">Corte seco</option>
            <option value="fundido">Fundido</option>
            <option value="deslizar">Deslizar</option>
            <option value="zoom">Zoom</option>
          </select>
        </label>
        <label className="etiqueta">Movimiento de cámara
          <select className="campo py-1" disabled={ocupado} value={mov}
            onChange={(ev) => void editar({ tipo: "efectosVisual", escena, movimiento: MOVIMIENTOS[ev.target.value] ?? null })}>
            <option value="ninguno">Ninguno</option>
            <option value="acercar">Acercar despacio</option>
            <option value="alejar">Alejar despacio</option>
            <option value="izquierda-derecha">Paneo a la derecha</option>
            <option value="derecha-izquierda">Paneo a la izquierda</option>
            {mov === "personalizado" && <option value="personalizado" disabled>Personalizado</option>}
          </select>
        </label>
        <label className="etiqueta">Velocidad del clip
          <select className="campo py-1" disabled={ocupado} value={String(efectos.velocidad)}
            onChange={(ev) => void editar({ tipo: "efectosVisual", escena, velocidad: Number(ev.target.value) })}>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((x) => <option key={x} value={String(x)}>{x === 1 ? "Normal" : `${x}×`}</option>)}
          </select>
        </label>
        <label className="etiqueta">Color
          <select className="campo py-1" disabled={ocupado} value={col}
            onChange={(ev) => void editar({ tipo: "efectosVisual", escena, color: COLORES[ev.target.value] ?? null })}>
            <option value="natural">Natural</option>
            <option value="vivo">Más vivo</option>
            <option value="claro">Más claro</option>
            <option value="apagado">Apagado</option>
            <option value="blanco-negro">Blanco y negro</option>
            {col === "personalizado" && <option value="personalizado" disabled>Personalizado</option>}
          </select>
        </label>
      </div>
    </details>
  );
}

const PLATAFORMAS = [["youtube", "YouTube Shorts"], ["tiktok", "TikTok"], ["instagram", "Instagram Reels"], ["facebook", "Facebook Reels"]] as const;

/** Destino, edición por texto global, música, textos superpuestos y pistas libres del proyecto. */
export function PanelAvanzado({ extras, formato, total, editar, alinearMusica, subirLibre, ocupado }: {
  extras: ExtrasV; formato: string; total: number; ocupado: boolean;
  editar: Editar;
  alinearMusica: () => Promise<void>;
  subirLibre: (f: File, pista: string, inicio: number, licencia: string) => Promise<void>;
}) {
  const d = extras.destino;
  const [texto, setTexto] = useState({ texto: "", inicio: "0", duracion: "3", estilo: "rotulo", posicion: "arriba" });
  const [libre, setLibre] = useState({ inicio: "0", licencia: "" });
  const conPlataformas = (pl: string, on: boolean) => editar({ tipo: "cambiarDestino", plataformas: on ? [...d.plataformas, pl] : d.plataformas.filter((x) => x !== pl) });
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <div className="tarjeta space-y-3 p-4">
        <h2 className="font-medium">Destino y entrega</h2>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={d.comercial} disabled={ocupado} onChange={(e) => void editar({ tipo: "cambiarDestino", comercial: e.target.checked })} />
          <span>Uso comercial (monetizado o para un cliente): el QC <strong>bloquea</strong> cualquier asset cuya licencia no lo permita o no se sepa.</span>
        </label>
        <fieldset className="space-y-1 text-sm" disabled={ocupado}>
          <legend className="etiqueta">Dónde se publica {formato !== "9:16" && <span className="text-tenue">(sólo cambia algo en 9:16)</span>}</legend>
          {PLATAFORMAS.map(([id, nombre]) => (
            <label key={id} className="mr-4 inline-flex items-center gap-1">
              <input type="checkbox" checked={d.plataformas.includes(id)} onChange={(e) => void conPlataformas(id, e.target.checked)} /> {nombre}
            </label>
          ))}
          <p className="text-xs text-tenue">Marca, subtítulos y textos se acomodan dentro de lo que no tapa la interfaz de todas las elegidas.</p>
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={d.master} disabled={ocupado} onChange={(e) => void editar({ tipo: "cambiarDestino", master: e.target.checked })} />
          <span>Guardar también un máster de archivo (.mov, calidad alta) en cada render. Tarda más y ocupa mucho más disco.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={d.marca} disabled={ocupado} onChange={(e) => void editar({ tipo: "cambiarDestino", marca: e.target.checked })} />
          <span>Mostrar la marca del canal arriba durante el video (la tarjeta final la muestra siempre). Apágala si tapa una cara.</span>
        </label>
      </div>

      <div className="tarjeta space-y-3 p-4">
        <h2 className="font-medium">Edición por texto y ritmo</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="boton" disabled={ocupado} onClick={() => void editar({ tipo: "quitarSilencios" })} title="Pausas de más de 0,6 s quedan en 0,25 s">Acortar silencios largos</button>
          <button type="button" className="boton" disabled={ocupado} onClick={() => void editar({ tipo: "quitarMuletillas" })} title="eh, em, mmm, uh…">Quitar muletillas</button>
          <button type="button" className="boton" disabled={ocupado} onClick={() => { if (confirm("¿Deshacer todos los recortes del proyecto?")) void editar({ tipo: "quitarRecortes" }); }}>Deshacer recortes</button>
        </div>
        {extras.confianza.medidas > 0
          ? <p className="text-xs text-tenue">Tiempos de la voz: {extras.confianza.dudosas} de {extras.confianza.medidas} palabras dudosas ({Math.round(extras.confianza.proporcion * 100)} %).</p>
          : <p className="text-xs text-tenue">Tiempos de la voz sin medir (proyecto anterior): regenera la voz para medir su confianza.</p>}
        {extras.musica && (
          <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-3 text-sm">
            <span>Música desde {extras.musica.inicio.toFixed(2)} s · {extras.musica.pulsos ? `${extras.musica.pulsos} pulsos marcados` : "sin pulsos"}</span>
            <button type="button" className="boton ml-auto" disabled={ocupado} onClick={() => void alinearMusica()}>Alinear cortes al ritmo</button>
          </div>
        )}
      </div>

      <div className="tarjeta space-y-3 p-4">
        <h2 className="font-medium">Textos en pantalla</h2>
        {extras.textos.length > 0 && (
          <ul className="space-y-1 text-sm">
            {extras.textos.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-xs text-tenue">{t.inicio.toFixed(1)}–{(t.inicio + t.duracion).toFixed(1)} s</span>
                <span className="min-w-0 flex-1 truncate">«{t.texto}» <span className="text-xs text-tenue">({t.estilo}, {t.posicion})</span></span>
                <button type="button" className="boton py-0.5 text-xs" disabled={ocupado} onClick={() => void editar({ tipo: "quitarTexto", id: t.id })}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
        <form className="grid gap-2 sm:grid-cols-6" onSubmit={(ev) => {
          ev.preventDefault();
          void editar({ tipo: "agregarTexto", texto: { texto: texto.texto.trim(), inicio: Number(texto.inicio), duracion: Number(texto.duracion), estilo: texto.estilo, posicion: texto.posicion } })
            .then(() => setTexto({ ...texto, texto: "" }));
        }}>
          <input aria-label="Texto" className="campo sm:col-span-6" placeholder="Título, dato o rótulo" maxLength={160} value={texto.texto} onChange={(e) => setTexto({ ...texto, texto: e.target.value })} />
          <label className="etiqueta sm:col-span-1">Desde (s)<input className="campo py-1" type="number" min={0} max={total} step={0.1} value={texto.inicio} onChange={(e) => setTexto({ ...texto, inicio: e.target.value })} /></label>
          <label className="etiqueta sm:col-span-1">Dura (s)<input className="campo py-1" type="number" min={0.3} max={60} step={0.1} value={texto.duracion} onChange={(e) => setTexto({ ...texto, duracion: e.target.value })} /></label>
          <label className="etiqueta sm:col-span-2">Estilo<select className="campo py-1" value={texto.estilo} onChange={(e) => setTexto({ ...texto, estilo: e.target.value })}><option value="rotulo">Rótulo</option><option value="titulo">Título</option><option value="cita">Cita</option></select></label>
          <label className="etiqueta sm:col-span-2">Dónde<select className="campo py-1" value={texto.posicion} onChange={(e) => setTexto({ ...texto, posicion: e.target.value })}><option value="arriba">Arriba</option><option value="centro">Centro</option><option value="abajo">Sobre los subtítulos</option></select></label>
          <button type="submit" className="boton sm:col-span-6" disabled={ocupado || !texto.texto.trim()}>Agregar texto</button>
        </form>
      </div>

      <div className="tarjeta space-y-3 p-4">
        <h2 className="font-medium">Superposiciones y efectos de sonido</h2>
        {extras.libres.length > 0 && (
          <ul className="space-y-1 text-sm">
            {extras.libres.flatMap((pi) => pi.clips.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-xs text-tenue">{c.inicio.toFixed(1)} s · {segundos(c.duracion)}</span>
                <span className="min-w-0 flex-1 truncate">{pi.tipo === "audio" ? "Sonido" : "Imagen/video"}: {c.ruta.split("/").pop()}</span>
                <button type="button" className="boton py-0.5 text-xs" disabled={ocupado} onClick={() => void editar({ tipo: "quitarClipLibre", clip: c.id })}>Quitar</button>
              </li>
            )))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="etiqueta">Desde (s)<input className="campo py-1" type="number" min={0} max={total} step={0.1} value={libre.inicio} onChange={(e) => setLibre({ ...libre, inicio: e.target.value })} /></label>
          <label className="etiqueta">Licencia (si no es tuyo)<input className="campo py-1" placeholder="p. ej. CC0, Pixabay" value={libre.licencia} onChange={(e) => setLibre({ ...libre, licencia: e.target.value })} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          {([["broll", "Agregar imagen o video encima…", "video/*,image/*"], ["efectos", "Agregar efecto de sonido…", "audio/*"]] as const).map(([pista, nombre, accept]) => (
            <label key={pista} className="boton cursor-pointer">
              {nombre}
              <input type="file" accept={accept} className="sr-only" disabled={ocupado}
                onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void subirLibre(f, pista, Number(libre.inicio), libre.licencia); ev.target.value = ""; }} />
            </label>
          ))}
        </div>
        <p className="text-xs text-tenue">La imagen o video tapa el plano de fondo (debajo de marca y subtítulos); el sonido suena fuera del ducking de la música.</p>
      </div>
    </section>
  );
}
