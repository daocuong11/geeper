/**
 * Exporta un geeper.json a OpenTimelineIO (.otio, JSON) para terminarlo a mano en un editor profesional:
 * FilmCraft (storytold/filmcraft, `crates/interchange/src/otio.rs`), DaVinci Resolve o Premiere.
 *
 * Reproduce la línea de tiempo que arma la mezcla (`mezcla.ts`) y el compilador:
 * - V1 «Visual»: hueco de ENTRADA y un clip por escena, con el rango del clip visual.
 * - A1 «Voz»: hueco de ENTRADA y los tramos de voz en orden.
 * - A2 «Música»: desde 0 y recortada a la duración de las escenas (la tarjeta final no va: es gráfica).
 * Cada clip visual lleva un marcador con el texto de su escena; los subtítulos van aparte en el .srt.
 */
import path from "node:path";
import { pistasLibres, type Asset, type Proyecto } from "./esquema";
import { ENTRADA, duracionEscenas, escenasEnLinea } from "./linea";

type J = Record<string, unknown>;

const rt = (s: number, rate: number): J => ({ OTIO_SCHEMA: "RationalTime.1", rate, value: Math.round(s * rate * 1000) / 1000 });
const tr = (inicio: number, duracion: number, rate: number): J => ({
  OTIO_SCHEMA: "TimeRange.1",
  start_time: rt(inicio, rate),
  duration: rt(duracion, rate),
});

const hueco = (duracion: number, rate: number): J => ({
  OTIO_SCHEMA: "Gap.1", name: "", source_range: tr(0, duracion, rate), effects: [], markers: [], enabled: true, metadata: {},
});

function referencia(a: Asset, dirProyecto: string, rate: number): J {
  const abs = path.resolve(dirProyecto, a.ruta);
  return {
    OTIO_SCHEMA: "ExternalReference.1",
    name: path.basename(a.ruta),
    target_url: `file://${abs.split("/").map(encodeURIComponent).join("/")}`,
    available_range: a.duracion ? tr(0, a.duracion, rate) : null,
    available_image_bounds: null,
    metadata: { geeper: { asset: a.id, source: a.source, licencia: a.licencia } },
  };
}

function clip(nombre: string, a: Asset, dir: string, inicio: number, duracion: number, rate: number, extra: { markers?: J[]; metadata?: J } = {}): J {
  return {
    OTIO_SCHEMA: "Clip.2",
    name: nombre,
    source_range: tr(inicio, duracion, rate),
    effects: [],
    markers: extra.markers ?? [],
    enabled: true,
    media_references: { DEFAULT_MEDIA: referencia(a, dir, rate) },
    active_media_reference_key: "DEFAULT_MEDIA",
    metadata: extra.metadata ?? {},
  };
}

const pistaOtio = (nombre: string, kind: "Video" | "Audio", children: J[]): J => ({
  OTIO_SCHEMA: "Track.1", name: nombre, kind, source_range: null, children, effects: [], markers: [], enabled: true, metadata: {},
});

export function aOtio(p: Proyecto, dirProyecto: string): J {
  const rate = p.fps;
  const activo = (id: string): Asset => {
    const a = p.assets[id];
    if (!a) throw new Error(`Falta el asset ${id}`);
    return a;
  };
  const escenas = escenasEnLinea(p);
  const total = duracionEscenas(p);

  const visual: J[] = [];
  const voz: J[] = [hueco(ENTRADA, rate)];
  for (const e of escenas) {
    const n = `Escena ${e.indice + 1}`;
    const nota = e.escena.texto.length > 120 ? `${e.escena.texto.slice(0, 117)}…` : e.escena.texto;
    const a = activo(e.visual.asset);
    const v = e.visual;
    const velocidad = v.velocidad ?? 1;
    const meta = {
      geeper: {
        escena: e.escena.id, ajuste: v.ajuste ?? null, ancla: v.ancla ?? null,
        movimiento: v.movimiento ?? null, color: v.color ?? null, transicion: v.transicion ?? null,
      },
    };
    // Fundido de entrada: transición OTIO entre la escena anterior y ésta.
    if (e.indice > 0 && v.transicion?.tipo === "fundido") {
      const d = Math.min(v.transicion.duracion, e.duracion);
      visual.push({
        OTIO_SCHEMA: "Transition.1", name: "Fundido", transition_type: "SMPTE_Dissolve",
        in_offset: rt(0, rate), out_offset: rt(d, rate), metadata: { geeper: { transicion: v.transicion } },
      });
    }
    // Igual que el compilador: la primera escena cubre la ENTRADA y, si el clip se acaba antes que la
    // escena, vuelve a empezar desde 0 (un tramo por vuelta). Con velocidad, el clip consume
    // `velocidad` segundos de material por segundo de línea.
    const largo = e.duracion + (e.indice === 0 ? ENTRADA : 0);
    let t = 0;
    let desde = v.rango.inicio;
    for (let k = 0; t < largo - 1e-3 && k < 50; k++) {
      const disponible = a.tipo === "imagen" || !a.duracion ? largo - t : (a.duracion - desde) / velocidad;
      if (disponible < 0.05) {
        desde = 0;
        continue;
      }
      const dur = Math.min(largo - t, disponible);
      const c = clip(k === 0 ? n : `${n} (vuelta ${k + 1})`, a, dirProyecto, desde, a.tipo === "imagen" ? dur : dur * velocidad, rate, {
        markers: k === 0 ? [{
          OTIO_SCHEMA: "Marker.2", name: nota, color: "CYAN", comment: e.escena.texto,
          marked_range: tr(desde, 0, rate), metadata: { geeper: { escena: e.escena.id } },
        }] : [],
        metadata: meta,
      });
      if (velocidad !== 1 && a.tipo !== "imagen") c.effects = [{ OTIO_SCHEMA: "LinearTimeWarp.1", name: "Velocidad", effect_name: "LinearTimeWarp", time_scalar: velocidad, metadata: {} }];
      visual.push(c);
      t += dur;
      desde = 0;
    }
    // Voz: un clip por tramo (lo que queda tras los recortes de la edición por texto).
    e.tramos.forEach((x, j) => {
      voz.push(clip(e.tramos.length > 1 ? `Voz ${e.indice + 1}.${j + 1}` : `Voz ${e.indice + 1}`, activo(e.voz.asset), dirProyecto, x.inicio, x.fin - x.inicio, rate, {
        metadata: { geeper: { escena: e.escena.id, tramo: j } },
      }));
    });
  }

  const pistas: J[] = [pistaOtio("Visual", "Video", visual), pistaOtio("Voz", "Audio", voz)];
  const m = p.pistas.find((x) => x.id === "musica")?.clips[0];
  if (m) {
    const a = activo(m.asset);
    const dur = Math.min(total, a.duracion ? a.duracion - m.rango.inicio : total);
    pistas.push(pistaOtio("Música", "Audio", [
      clip("Música", a, dirProyecto, m.rango.inicio, dur, rate, { metadata: { geeper: { volumen: m.volumen ?? 0.15, ducking: true } } }),
    ]));
  }
  // Pistas libres: superposiciones de video y efectos de sonido, con huecos hasta cada clip.
  for (const pi of pistasLibres(p)) {
    const hijos: J[] = [];
    let cursor = 0;
    for (const c of [...pi.clips].sort((x, y) => (x.inicio ?? 0) - (y.inicio ?? 0))) {
      const ini = c.inicio ?? 0;
      if (ini > cursor + 1e-3) hijos.push(hueco(ini - cursor, rate));
      const a = activo(c.asset);
      const enLinea = c.rango.duracion / (c.velocidad ?? 1);
      hijos.push(clip(c.id, a, dirProyecto, c.rango.inicio, c.rango.duracion, rate, {
        metadata: { geeper: { volumen: c.volumen ?? null, opacidad: c.opacidad ?? null, transicion: c.transicion ?? null, movimiento: c.movimiento ?? null } },
      }));
      cursor = Math.max(cursor, ini + enLinea);
    }
    pistas.push(pistaOtio(pi.tipo === "video" ? `Superposición ${pi.id}` : `Efectos ${pi.id}`, pi.tipo === "video" ? "Video" : "Audio", hijos));
  }

  return {
    OTIO_SCHEMA: "Timeline.1",
    name: p.nombre,
    global_start_time: null,
    tracks: {
      OTIO_SCHEMA: "Stack.1", name: "tracks", source_range: null, children: pistas, effects: [], enabled: true,
      markers: [
        ...p.marcadores.map((mk) => ({
          OTIO_SCHEMA: "Marker.2", name: mk.nombre, color: mk.tipo === "corte" ? "RED" : mk.tipo === "pulso" ? "GREEN" : "YELLOW", comment: "",
          marked_range: tr(mk.tiempo, 0, rate), metadata: { geeper: { tipo: mk.tipo } },
        })),
        // Textos superpuestos: como marcadores con su duración (el editor los vuelve a poner a mano).
        ...p.textos.map((tx) => ({
          OTIO_SCHEMA: "Marker.2", name: tx.texto, color: "MAGENTA", comment: `${tx.estilo}, ${tx.posicion}`,
          marked_range: tr(tx.inicio, tx.duracion, rate), metadata: { geeper: { texto: tx } },
        })),
      ],
      metadata: {},
    },
    metadata: {
      geeper: {
        proyecto: p.id, formato: p.formato, plantilla: p.plantilla, fps: p.fps, duracion: total,
        comercial: p.comercial, plataformas: p.plataformas,
      },
    },
  };
}

/** Lo que sólo vive en el render de Hyperframes y no viaja en el .otio. */
export const NO_VIAJA = [
  "subtítulos animados (van en el .srt)",
  "chip de marca, zoom en los cortes y tarjeta final",
  "fondo desenfocado del modo «contener»",
  "ducking de la música (se anota en metadata.geeper)",
  "textos superpuestos (van como marcadores con su duración)",
  "movimiento de cámara, color, opacidad y transiciones que no son fundido (en metadata.geeper)",
] as const;
