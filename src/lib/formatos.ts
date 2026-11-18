/** Medidas por formato: lienzo, banda segura y caja de cada elemento (las usa el compilador y el QC). */
import type { Formato } from "./esquema";

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Metricas {
  W: number;
  H: number;
  perfil: "shorts-9x16" | "youtube-16x9" | "cuadrado-1x1";
  /** Banda segura para texto y logo. */
  segura: Caja;
  marcaTop: number;
  marcaFs: number;
  subs: Caja;
  subsFs: number;
  pastillaMax: number;
  tituloFs: number;
  ctaFs: number;
}

const M: Record<Formato, Metricas> = {
  // Shorts: la interfaz de YouTube tapa arriba y abajo; el texto va entre 168 y 1330 px.
  "9:16": {
    W: 1080, H: 1920, perfil: "shorts-9x16",
    segura: { x: 60, y: 168, w: 960, h: 1162 },
    marcaTop: 190, marcaFs: 44,
    subs: { x: 70, y: 1010, w: 940, h: 300 }, subsFs: 60, pastillaMax: 940,
    tituloFs: 120, ctaFs: 54,
  },
  // 16:9: zona segura de títulos del 90 %.
  "16:9": {
    W: 1920, H: 1080, perfil: "youtube-16x9",
    segura: { x: 96, y: 54, w: 1728, h: 972 },
    marcaTop: 64, marcaFs: 40,
    subs: { x: 210, y: 760, w: 1500, h: 230 }, subsFs: 68, pastillaMax: 1500,
    tituloFs: 132, ctaFs: 48,
  },
  "1:1": {
    W: 1080, H: 1080, perfil: "cuadrado-1x1",
    segura: { x: 54, y: 54, w: 972, h: 972 },
    marcaTop: 70, marcaFs: 38,
    subs: { x: 70, y: 770, w: 940, h: 220 }, subsFs: 58, pastillaMax: 940,
    tituloFs: 104, ctaFs: 46,
  },
};

export function metricas(f: Formato): Metricas {
  return M[f];
}

/** Ancho medio de un carácter en las tipografías gruesas de las plantillas (fracción del cuerpo). */
export const ANCHO_CARACTER = 0.6;
export const PADDING_PASTILLA = 36;

/** Caracteres que caben en una línea de subtítulo en este formato. */
export function caracteresPorLinea(f: Formato): number {
  const m = M[f];
  return Math.floor((m.pastillaMax - 2 * PADDING_PASTILLA) / (m.subsFs * ANCHO_CARACTER));
}

export function dentro(c: Caja, s: Caja): boolean {
  return c.x >= s.x - 0.5 && c.y >= s.y - 0.5 && c.x + c.w <= s.x + s.w + 0.5 && c.y + c.h <= s.y + s.h + 0.5;
}
