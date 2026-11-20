/**
 * Revisión del título y la descripción antes de publicar: lo que cada red recortaría, ignoraría o
 * rechazaría, dicho antes de encolar y, cuando se puede, con un arreglo de un clic. Los adaptadores
 * recortan en silencio (youtube.ts quita `<` y `>` y corta a 5000 bytes; tiktok.ts e instagram.ts
 * cortan a 2200): esto lo dice antes.
 *
 * El formato de cada problema (gravedad, qué pasa, cómo arreglarlo) sale del registro de problemas de
 * la auditoría de every-app/open-seo `src/shared/audit-issues.ts` (MIT), commit af3f995: `missing-title`,
 * `duplicate-title` y `missing-meta-description` pasados de páginas web a publicaciones en redes.
 *
 * Pura y sin Node: la usa el panel de publicar en el navegador.
 */

export type Gravedad = "error" | "aviso" | "info";

export interface Problema {
  id: string;
  gravedad: Gravedad;
  /** Qué pasa, en una frase. */
  que: string;
  /** Qué hacer. */
  hacer: string;
  /** Texto del botón si Geeper lo puede arreglar solo (ver `arreglar`). */
  arreglo?: string;
}

export interface TextoPublicacion {
  red: string;
  titulo: string;
  descripcion: string;
  /** Títulos ya usados en la misma cuenta (en cualquier proyecto), para avisar de duplicados. */
  titulosPrevios?: string[];
  /** Para el arreglo de «sin título» (p. ej. el nombre del proyecto). */
  tituloSugerido?: string;
  /** Para el arreglo de «sin descripción» (p. ej. el tema del video). */
  descripcionSugerida?: string;
}

/** Límites documentados de cada red. Los mismos que aplican los adaptadores. */
export const LIMITES = {
  youtube: { titulo: 100, descripcionBytes: 5000, hashtags: 60, tituloVisible: 70 },
  tiktok: { textoUtf16: 2200 },
  instagram: { caption: 2200, hashtags: 30, menciones: 20 },
} as const;

/** Cuántos hashtags deja el arreglo de YouTube: los que se ven y bastan para describir el video. */
export const HASHTAGS_RECOMENDADOS = 5;

const HASHTAG = /(^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]+)/gu;
const MENCION = /(?:^|[^\p{L}\p{N}_.@])@([\p{L}\p{N}_.]+)/gu;

export function contarHashtags(t: string): number {
  return [...t.matchAll(HASHTAG)].length;
}

export function contarMenciones(t: string): number {
  return [...t.matchAll(MENCION)].length;
}

/** Para comparar títulos: sin mayúsculas, tildes, signos ni espacios repetidos. */
export function normalizarTitulo(t: string): string {
  return t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const bytes = (t: string) => new TextEncoder().encode(t).length;

/** Lo que manda TikTok o Instagram: título y descripción separados por una línea en blanco. */
const juntos = (titulo: string, desc: string) => [titulo, desc].filter(Boolean).join("\n\n");

export function revisarTexto(p: TextoPublicacion): Problema[] {
  const out: Problema[] = [];
  const titulo = p.titulo.trim();
  const desc = p.descripcion.trim();

  if (!titulo) {
    out.push({
      id: "sin-titulo", gravedad: "error", que: "Falta el título.", hacer: "Escribe de qué trata el video.",
      ...(p.tituloSugerido?.trim() ? { arreglo: "Usar el nombre del proyecto" } : {}),
    });
  }

  const previo = titulo && (p.titulosPrevios ?? []).find((t) => normalizarTitulo(t) === normalizarTitulo(titulo));
  if (previo) {
    out.push({
      id: "titulo-repetido",
      gravedad: "aviso",
      que: `Ya hay un video con este título en esta cuenta («${previo}»).`,
      hacer: "Cámbialo un poco para que la gente (y la red) los distinga.",
    });
  }

  if (p.red === "youtube") {
    const L = LIMITES.youtube;
    if (/[<>]/.test(titulo) || /[<>]/.test(desc)) {
      out.push({ id: "yt-angulos", gravedad: "aviso", que: "YouTube no acepta los signos < y >.", hacer: "Si no los quitas, Geeper los borra al subir.", arreglo: "Quitarlos" });
    }
    if (Array.from(titulo).length > L.tituloVisible) {
      out.push({ id: "yt-titulo-largo", gravedad: "info", que: "El título es largo: en el teléfono se ve cortado con «…».", hacer: "Pon lo más importante al principio." });
    }
    if (!desc) {
      out.push({
        id: "yt-sin-descripcion", gravedad: "info", que: "Falta la descripción.",
        hacer: "Ayuda a que YouTube muestre el video a quien lo busca: una o dos frases bastan.",
        ...(p.descripcionSugerida?.trim() ? { arreglo: "Usar el tema del video" } : {}),
      });
    }
    if (bytes(desc) > L.descripcionBytes) {
      out.push({ id: "yt-descripcion-larga", gravedad: "aviso", que: "La descripción es demasiado larga: YouTube cortará el final.", hacer: "Acórtala.", arreglo: "Recortar para que entre" });
    }
    const n = contarHashtags(`${titulo}\n${desc}`);
    if (n > L.hashtags) {
      out.push({
        id: "yt-hashtags", gravedad: "aviso", que: `Tiene ${n} hashtags: con más de ${L.hashtags}, YouTube no toma ninguno.`,
        hacer: `Deja ${HASHTAGS_RECOMENDADOS} que describan el video.`, arreglo: `Dejar los primeros ${HASHTAGS_RECOMENDADOS}`,
      });
    }
  }

  if (p.red === "tiktok" && juntos(titulo, desc).length > LIMITES.tiktok.textoUtf16) {
    out.push({ id: "tt-largo", gravedad: "aviso", que: "El texto es demasiado largo: TikTok cortará el final.", hacer: "Acorta la descripción.", arreglo: "Recortar para que entre" });
  }

  if (p.red === "instagram") {
    const L = LIMITES.instagram;
    const caption = juntos(titulo, desc);
    if (caption.length > L.caption) {
      out.push({ id: "ig-largo", gravedad: "aviso", que: "El texto es demasiado largo: Instagram cortará el final.", hacer: "Acorta la descripción.", arreglo: "Recortar para que entre" });
    }
    const n = contarHashtags(caption);
    if (n > L.hashtags) {
      out.push({ id: "ig-hashtags", gravedad: "error", que: `Tiene ${n} hashtags y Instagram no publica con más de ${L.hashtags}.`, hacer: `Deja ${L.hashtags} o menos.`, arreglo: `Dejar los primeros ${L.hashtags}` });
    }
    const m = contarMenciones(caption);
    if (m > L.menciones) {
      out.push({ id: "ig-menciones", gravedad: "error", que: `Menciona a ${m} cuentas (@) y Instagram no publica con más de ${L.menciones}.`, hacer: `Borra las que sobren hasta dejar ${L.menciones}.` });
    }
  }

  return out;
}

/** Si algún problema impide publicar (la red lo rechazaría). */
export const bloquea = (ps: Problema[]) => ps.some((x) => x.gravedad === "error");

/** Deja los primeros `max` hashtags de `texto` y borra el resto (con el espacio que los precedía). */
export function dejarHashtags(texto: string, max: number): string {
  let i = 0;
  return texto
    .replace(HASHTAG, (todo, antes: string) => (i++ < max ? todo : antes))
    .replace(/[ \t]+$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Corta `texto` para que `cabe` dé true, en el último espacio si queda cerca (sin cortar palabras). */
export function recortarHasta(texto: string, cabe: (t: string) => boolean): string {
  if (cabe(texto)) return texto;
  const cs = Array.from(texto);
  let lo = 0;
  let hi = cs.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (cabe(cs.slice(0, mid).join(""))) lo = mid;
    else hi = mid - 1;
  }
  const corte = cs.slice(0, lo).join("");
  const espacio = corte.search(/\s\S*$/);
  return (espacio > corte.length - 40 && espacio > 0 ? corte.slice(0, espacio) : corte).trimEnd();
}

/** Aplica el arreglo de un problema y devuelve el título y la descripción nuevos. */
export function arreglar(p: TextoPublicacion, id: string): { titulo: string; descripcion: string } {
  const titulo = p.titulo.trim();
  const desc = p.descripcion.trim();
  switch (id) {
    case "sin-titulo":
      return { titulo: (p.tituloSugerido ?? "").trim().slice(0, LIMITES.youtube.titulo), descripcion: p.descripcion };
    case "yt-sin-descripcion":
      return { titulo: p.titulo, descripcion: (p.descripcionSugerida ?? "").trim() };
    case "yt-angulos":
      return { titulo: p.titulo.replace(/[<>]/g, ""), descripcion: p.descripcion.replace(/[<>]/g, "") };
    case "yt-hashtags":
      return { titulo: p.titulo, descripcion: dejarHashtags(desc, Math.max(0, HASHTAGS_RECOMENDADOS - contarHashtags(titulo))) };
    case "ig-hashtags":
      return { titulo: p.titulo, descripcion: dejarHashtags(desc, Math.max(0, LIMITES.instagram.hashtags - contarHashtags(titulo))) };
    case "yt-descripcion-larga":
      return { titulo: p.titulo, descripcion: recortarHasta(desc, (t) => bytes(t) <= LIMITES.youtube.descripcionBytes) };
    case "tt-largo":
      return { titulo: p.titulo, descripcion: recortarHasta(desc, (t) => juntos(titulo, t).length <= LIMITES.tiktok.textoUtf16) };
    case "ig-largo":
      return { titulo: p.titulo, descripcion: recortarHasta(desc, (t) => juntos(titulo, t).length <= LIMITES.instagram.caption) };
    default:
      return { titulo: p.titulo, descripcion: p.descripcion };
  }
}
