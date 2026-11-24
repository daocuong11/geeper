/**
 * SVG como asset de imagen (logos, rótulos y superposiciones vectoriales, p. ej. exportados de
 * VectorCraft con `vectorcraft-cli convert logo.ai logo.svg`). Un SVG es un documento, no un mapa de
 * bits: puede traer scripts y pedir recursos de afuera. No se sanea: se **rechaza** lo que no sea
 * dibujo autocontenido, para que el render sea reproducible y abrir el archivo no ejecute nada.
 */

/** Tope de tamaño de un SVG subido (un logo pesa KB; más de esto casi siempre es un raster incrustado). */
export const MAX_SVG = 20 * 1024 ** 2;

export const esSvg = (ruta: string) => /\.svg$/i.test(ruta);

/**
 * Cabecera para servir un SVG: si alguien lo abre directo en el navegador, no ejecuta scripts ni pide
 * nada de afuera (defensa extra; `revisarSvg` ya rechaza eso al subirlo).
 */
export const CSP_SVG = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";

/** Sólo se permiten referencias internas (`#id`) o imágenes incrustadas raster en base64. */
const REFERENCIA_OK = /^(#[^\s]*|data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]*)$/i;

const PROHIBIDO: [RegExp, string][] = [
  [/<!DOCTYPE|<!ENTITY/i, "trae declaraciones internas (DOCTYPE o ENTITY)"],
  [/<\s*(?:[\w.-]+:)?(script|foreignObject|iframe|embed|object|handler|listener)\b/i, "trae código o contenido web incrustado (script, foreignObject, iframe…)"],
  [/(?:^|[\s"'/])(?:[\w.-]+:)?on[a-z]+\s*=/i, "trae código que se ejecuta al tocarlo (atributos on…)"],
  [/javascript\s*:/i, "trae un enlace javascript:"],
  [/@import/i, "carga estilos de afuera (@import)"],
  [/attributeName\s*=\s*["']\s*(?:[\w.-]+:)?(href|on[a-z])/i, "trae una animación que cambia enlaces o eventos"],
  // CSS que pide recursos sin pasar por url(), o escapes CSS (`\75rl(` es `url(`).
  [/(?:-webkit-)?image-set\s*\(|cross-fade\s*\(|element\s*\(|\bsrc\s*\(/i, "pide imágenes desde los estilos (image-set o src)"],
  [/\\/, "trae escapes con barra invertida (\\)"],
];

/** Qué hacer con un SVG rechazado, en palabras de quien no sabe qué es un SVG por dentro. */
export const CONSEJO_SVG =
  "Expórtalo otra vez como «SVG simple» u «optimizado», con el texto convertido a contornos y sin imágenes enlazadas; o súbelo como PNG con fondo transparente.";

/** Error de un SVG que no se puede usar: el mensaje ya es para la persona (motivo y qué hacer). */
export class SvgRechazado extends Error {}

const rechazo = (motivo: string, consejo = CONSEJO_SVG) => new SvgRechazado(`Este SVG no se puede usar: ${motivo}. ${consejo}`);

/** Entidades que resuelve el parser XML dentro de valores y texto (sin DOCTYPE no hay otras). */
function decodificarEntidades(s: string): string {
  const fijas: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  // Iterar: `&amp;#x75;` no es `u` para XML, pero decodificar de más sólo puede rechazar de más.
  for (let i = 0; i < 3 && s.includes("&"); i++) {
    s = s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (m, hex: string, dec: string, nom: string) => {
      if (nom) return fijas[nom.toLowerCase()]!;
      const cp = hex ? parseInt(hex, 16) : Number(dec);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    });
  }
  return s;
}

/**
 * Revisa un SVG y devuelve su tamaño en píxeles (width/height de la raíz, o el viewBox).
 * Lanza un Error en español con el motivo si no se puede usar.
 */
export function revisarSvg(texto: string): { ancho: number; alto: number } {
  // Lo crudo y lo decodificado: `attributeName="hr&#x65;f"` es un href para el parser XML.
  for (const t of [texto, decodificarEntidades(texto)]) revisarContenido(t);
  return tamano(texto);
}

function revisarContenido(texto: string): void {
  for (const [re, motivo] of PROHIBIDO) if (re.test(texto)) throw rechazo(motivo);

  for (const m of texto.matchAll(/(?:^|[\s"'])((?:[\w.-]+:)?href)\s*=\s*(["'])([\s\S]*?)\2/gi)) {
    if (!REFERENCIA_OK.test(m[3]!.trim())) throw rechazo(`enlaza algo de afuera («${m[3]!.trim().slice(0, 60)}»)`);
  }
  if (/(?:^|[\s"'])(?:[\w.-]+:)?href\s*=\s*[^"'\s]/i.test(texto)) throw rechazo("trae un enlace mal escrito (href sin comillas)");
  for (const m of texto.matchAll(/url\(\s*(["']?)([\s\S]*?)\1\s*\)/gi)) {
    if (!REFERENCIA_OK.test(m[2]!.trim())) throw rechazo(`usa un recurso de afuera en sus estilos («${m[2]!.trim().slice(0, 60)}»)`);
  }
}

function tamano(texto: string): { ancho: number; alto: number } {
  // La raíz tiene que ser <svg> (después de la declaración XML y comentarios).
  const sinPrologo = texto.replace(/^﻿?\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*/, "");
  const raiz = /^<\s*(?:[\w.-]+:)?svg\b([^>]*)>/i.exec(sinPrologo);
  if (!raiz) throw rechazo("no es un SVG (el archivo no empieza con <svg>)", "Ábrelo en tu programa de diseño y expórtalo otra vez como SVG.");
  const attrs = raiz[1]!;
  const attr = (n: string) => new RegExp(`(?:^|\\s)${n}\\s*=\\s*["']([^"']*)["']`, "i").exec(attrs)?.[1]?.trim();

  const px = (v: string | undefined) => {
    const m = v ? /^(\d+(?:\.\d+)?)(px)?$/i.exec(v) : null;
    return m ? Number(m[1]) : undefined;
  };
  let ancho = px(attr("width"));
  let alto = px(attr("height"));
  const vb = attr("viewBox")?.split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0) {
    // Con un solo lado explícito, el otro sale de la proporción del viewBox.
    if (ancho && !alto) alto = (ancho * vb[3]!) / vb[2]!;
    else if (alto && !ancho) ancho = (alto * vb[2]!) / vb[3]!;
    else if (!ancho && !alto) [ancho, alto] = [vb[2]!, vb[3]!];
  }
  if (!ancho || !alto) throw rechazo("no dice su tamaño", "Al exportarlo, marca que guarde el tamaño (ancho y alto en px, o viewBox).");
  return { ancho: Math.max(1, Math.round(ancho)), alto: Math.max(1, Math.round(alto)) };
}
