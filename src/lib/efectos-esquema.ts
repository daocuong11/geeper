/**
 * Esquemas de los efectos, transiciones con máscara, modos de fusión y curvas de geeper.json (sin
 * dependencias de Node: lo importa esquema.ts, que también corre en el navegador). La traducción a
 * Hyperframes está en efectos.ts; la procedencia de cada fórmula, en docs/EFFECTCRAFT.md.
 */
import { z } from "zod";

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "color #rrggbb");

export const Efecto = z.discriminatedUnion("tipo", [
  /** Lleva la luminancia entre dos colores (negro → `negro`, blanco → `blanco`). */
  z.object({
    tipo: z.literal("tinte"),
    negro: Hex.default("#000000"),
    blanco: Hex.default("#ffffff"),
    cantidad: z.number().min(0).max(1).default(1),
  }),
  /** Niveles de entrada y salida (0..1) con gamma. */
  z.object({
    tipo: z.literal("niveles"),
    entradaNegro: z.number().min(0).max(1).default(0),
    entradaBlanco: z.number().min(0).max(1).default(1),
    gamma: z.number().min(0.1).max(10).default(1),
    salidaNegro: z.number().min(0).max(1).default(0),
    salidaBlanco: z.number().min(0).max(1).default(1),
  }),
  /** Oscurece hacia los bordes; `angulo` es el ángulo de visión (más grande = viñeta más cerrada). */
  z.object({
    tipo: z.literal("vineta"),
    cantidad: z.number().min(0).max(1).default(0.5),
    angulo: z.number().min(1).max(179).default(60),
  }),
  /** Desenfoque gaussiano; `radio` en píxeles del cuadro. */
  z.object({
    tipo: z.literal("desenfoque"),
    radio: z.number().min(0).max(200).default(8),
  }),
  /** Grano que cambia en cada fotograma; `color` = ruido distinto por canal. */
  z.object({
    tipo: z.literal("grano"),
    cantidad: z.number().min(0).max(1).default(0.12),
    color: z.boolean().default(false),
    semilla: z.number().int().min(0).default(1),
  }),
]);
export type Efecto = z.infer<typeof Efecto>;

/** Transiciones que se hacen con una máscara sobre el clip que entra. */
export const TIPOS_MASCARA = ["barrido", "radial", "iris", "persianas"] as const;
export type TipoMascara = (typeof TIPOS_MASCARA)[number];
export const esMascara = (tipo: string): tipo is TipoMascara => (TIPOS_MASCARA as readonly string[]).includes(tipo);

/** Campos extra de una transición con máscara (todos opcionales). */
export const OpcionesMascara = {
  /** Barrido y persianas: dirección en grados (90 = de izquierda a derecha; 180 = de arriba abajo). Radial: ángulo de inicio. */
  angulo: z.number().min(-360).max(360).optional(),
  /** Borde suave en píxeles del cuadro (el «Feather» de After Effects). */
  suavizado: z.number().min(0).max(500).optional(),
  /** Persianas: ancho de cada franja en píxeles del cuadro. */
  ancho: z.number().min(4).max(2000).optional(),
  /** Radial: hacia dónde gira. */
  sentido: z.enum(["horario", "antihorario", "ambos"]).optional(),
};

/** Modos de fusión de una superposición (los nombres de After Effects en español → CSS). */
export const FUSIONES = {
  normal: "normal",
  multiplicar: "multiply",
  trama: "screen",
  superponer: "overlay",
  oscurecer: "darken",
  aclarar: "lighten",
  sobreexponer: "color-dodge",
  subexponer: "color-burn",
  "luz-fuerte": "hard-light",
  "luz-suave": "soft-light",
  diferencia: "difference",
  exclusion: "exclusion",
  tono: "hue",
  saturacion: "saturation",
  color: "color",
  luminosidad: "luminosity",
  /** «Añadir» de After Effects (sobreexposición lineal). */
  anadir: "plus-lighter",
} as const;
export const Fusion = z.enum(Object.keys(FUSIONES) as [keyof typeof FUSIONES, ...(keyof typeof FUSIONES)[]]);
export type Fusion = z.infer<typeof Fusion>;

/**
 * Las cuatro mezclas que ve una persona sin experiencia, con el modo de fusión que guardan. Aclarar
 * (trama) hace desaparecer el negro: luces, destellos, polvo. Oscurecer (multiplicar) hace desaparecer
 * el blanco: texturas de papel, manchas. Contraste (superponer) tiñe sin tapar.
 */
export const MEZCLAS_SIMPLES = {
  normal: "normal",
  aclarar: "trama",
  oscurecer: "multiplicar",
  contraste: "superponer",
} as const satisfies Record<string, Fusion>;
export type MezclaSimple = keyof typeof MEZCLAS_SIMPLES;

/** Mezcla simple de un modo de fusión guardado (null si es uno de los avanzados). */
export function mezclaSimple(f: Fusion | undefined): MezclaSimple | null {
  const e = Object.entries(MEZCLAS_SIMPLES).find(([, v]) => v === (f ?? "normal"));
  return e ? (e[0] as MezclaSimple) : null;
}

/** CSS del modo de fusión (vacío si es normal o no hay). */
export function cssFusion(f: Fusion | undefined): string {
  return f && f !== "normal" ? `mix-blend-mode: ${FUSIONES[f]};` : "";
}

/**
 * Curvas del movimiento de cámara como puntos de control de una Bézier cúbica (tiempo, avance).
 * «suave» es Easy Ease (F9): influencia 33,3 % y velocidad 0 en las dos claves. «acelera» y «frena»
 * son Easy Ease Out / In con la otra clave lineal, que After Effects deja en influencia 16,7 %.
 */
export const CURVAS = {
  lineal: null,
  suave: [1 / 3, 0, 2 / 3, 1],
  acelera: [1 / 3, 0, 5 / 6, 5 / 6],
  frena: [1 / 6, 1 / 6, 2 / 3, 1],
} as const;
export const Curva = z.enum(["lineal", "suave", "acelera", "frena"]);
export type Curva = z.infer<typeof Curva>;
