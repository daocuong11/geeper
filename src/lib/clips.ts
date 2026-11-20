/**
 * Reglas de los clips sacados de material ajeno (directos, VODs). Puras: sin disco ni red.
 *
 * Vienen de Bodila51/gtavi-claudecode (`check.py`, `hook-writer`, `cut.py`; MIT) y se aplican en el
 * QC de cualquier proyecto con `origen.clip`:
 *  - nada de leaks, «jugar antes», piratería, trampas de dinero ni bots en títulos y textos,
 *  - nunca presentarse como oficial,
 *  - el crédito del creador tiene que existir (va en la descripción del post, no en el video),
 *  - duración dentro de la campaña si se cargaron sus reglas.
 */
import { z } from "zod";
import type { Mostrar, Proyecto } from "./esquema";
import type { Regla } from "./qc";

export const Campania = z.object({
  nombre: z.string().optional(),
  minSegundos: z.number().positive().optional(),
  maxSegundos: z.number().positive().optional(),
  hashtags: z.array(z.string().regex(/^#\w+$/u)).default([]),
  mencion: z.string().regex(/^@[\w.]+$/u).optional(),
});
export type Campania = z.infer<typeof Campania>;

export const OrigenClip = z.object({
  fuente: z.string(),
  url: z.string(),
  titulo: z.string(),
  canal: z.string().nullable(),
  plataforma: z.string().nullable(),
  inicio: z.number(),
  fin: z.number(),
  encuadre: z.string(),
  reencuadre: z.string().optional(),
  credito: z.string(),
  campania: Campania.optional(),
});
export type OrigenClip = z.infer<typeof OrigenClip>;

/** Términos que no van nunca en títulos, ganchos ni descripciones de clips de juegos. */
export const PROHIBIDOS = [
  "leak", "leaked", "filtración", "filtrado", "filtrada", "play early", "jugar antes", "early access download",
  "free download", "descarga gratis", "descargar gratis", "crack", "crackeado", "piracy", "pirata", "piratería",
  "mod menu", "money glitch", "glitch de dinero", "dinero infinito", "afk bot",
];
/** Un fan nunca es oficial. */
const OFICIAL = /\b(official|oficial)\b/i;

export function terminosProhibidos(texto: string): string[] {
  const t = texto.toLowerCase();
  const hallados = PROHIBIDOS.filter((p) => new RegExp(`(^|[^\\p{L}])${p.replace(/ /g, "\\s+")}($|[^\\p{L}])`, "u").test(t));
  if (OFICIAL.test(texto)) hallados.push("oficial");
  return hallados;
}

export function origenClip(p: Pick<Proyecto, "origen">): OrigenClip | null {
  const r = OrigenClip.safeParse(p.origen?.clip);
  return r.success ? r.data : null;
}

/** QC de un clip (null si el proyecto no es un clip). `duracion` = lo que dura el video sin la tarjeta final. */
export function reglaClip(p: Pick<Proyecto, "origen" | "textos" | "nombre">, duracion: number): Regla | null {
  const o = origenClip(p);
  if (!o) return null;
  const problemas: string[] = [];
  const textos = [p.nombre, ...p.textos.map((t) => t.texto)];
  for (const t of textos) {
    const h = terminosProhibidos(t);
    if (h.length) problemas.push(`«${t}»: ${h.join(", ")}`);
  }
  if (o.plataforma !== "archivo" && !o.credito.trim()) problemas.push("falta el crédito del creador");
  const c = o.campania;
  if (c?.minSegundos && duracion < c.minSegundos) problemas.push(`dura ${duracion.toFixed(1)} s y la campaña pide ≥ ${c.minSegundos} s`);
  if (c?.maxSegundos && duracion > c.maxSegundos) problemas.push(`dura ${duracion.toFixed(1)} s y la campaña pide ≤ ${c.maxSegundos} s`);
  return {
    id: "clip",
    nombre: "Clip de material ajeno (términos, crédito, campaña)",
    ok: problemas.length === 0,
    medido: { duracion: Number(duracion.toFixed(2)), credito: o.credito, campania: c?.nombre ?? null },
    objetivo: "sin leaks, piratería ni «oficial»; crédito del creador" + (c ? "; duración de la campaña" : ""),
    detalle: problemas.join("\n") || undefined,
  };
}

/** Descripción para el post: crédito, hashtags y mención de la campaña (sin inventar nada). */
export function descripcionClip(o: OrigenClip): string {
  const partes = [o.credito];
  if (o.campania?.mencion) partes.push(o.campania.mencion);
  if (o.campania?.hashtags.length) partes.push(o.campania.hashtags.join(" "));
  return partes.filter(Boolean).join("\n");
}

/**
 * Insultos racistas, homófobos o capacitistas que se enmascaran siempre en los subtítulos (n****): se
 * oyen en el audio del streamer, pero no se queman en pantalla. Lista corta y exacta (palabra a
 * palabra, sin distinguir mayúsculas), aplicada vía `mostrar`.
 */
const INSULTOS = ["nigger", "niggers", "nigga", "niggas", "faggot", "faggots", "fag", "fags", "retard", "retards", "retarded", "tranny", "trannies", "maricón", "maricones", "sudaca", "sudacas"];

export function mascaraInsultos(): Mostrar[] {
  return INSULTOS.map((w) => ({ de: w, a: w[0] + "*".repeat(w.length - 1) }));
}
