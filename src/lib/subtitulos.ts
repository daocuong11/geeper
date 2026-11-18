/**
 * Subtítulos: de las palabras oídas a los grupos que se muestran.
 * `reemplazar` y `agrupar` son la misma lógica que `reemplazos` y `agrupar` de mpt_acabado.py
 * (hay una prueba de paridad contra el Python en tests/subtitulos.test.ts).
 */
import type { Correccion, Mostrar, Palabra } from "./esquema";

export const MAX_PALABRAS = 4;
export const PAUSA_CORTE = 0.15;

/** Palabra que se muestra, con el rango de palabras oídas del que sale. */
export interface Ficha {
  texto: string;
  inicio: number;
  fin: number;
  /** Índices [desde, hasta) de las palabras oídas de la escena. */
  origen: [number, number];
}

export function norm(token: string): string {
  return token
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

function repartir(textos: string[], inicio: number, fin: number, origen: [number, number]): Ficha[] {
  const paso = (fin - inicio) / Math.max(1, textos.length);
  return textos.map((t, k) => ({ texto: t, inicio: inicio + paso * k, fin: inicio + paso * (k + 1), origen }));
}

/** Aplica las correcciones de la escena (por índices de palabras oídas). */
export function aplicarCorrecciones(palabras: Palabra[], correcciones: Correccion[]): Ficha[] {
  const orden = [...correcciones].sort((a, b) => a.desde - b.desde);
  const out: Ficha[] = [];
  let i = 0;
  for (const c of orden) {
    if (c.desde < i || c.hasta > palabras.length || c.hasta <= c.desde) continue; // solapada o inválida
    for (; i < c.desde; i++) {
      const p = palabras[i]!;
      out.push({ texto: p.texto, inicio: p.inicio, fin: p.fin, origen: [i, i + 1] });
    }
    const tokens = c.texto.split(/\s+/).filter(Boolean);
    if (tokens.length) out.push(...repartir(tokens, palabras[c.desde]!.inicio, palabras[c.hasta - 1]!.fin, [c.desde, c.hasta]));
    i = c.hasta;
  }
  for (; i < palabras.length; i++) {
    const p = palabras[i]!;
    out.push({ texto: p.texto, inicio: p.inicio, fin: p.fin, origen: [i, i + 1] });
  }
  return out;
}

/** «GTA seis=GTA VI»: cambia lo que se muestra conservando los tiempos (como reemplazos()). */
export function reemplazar(fichas: Ficha[], pares: Mostrar[]): Ficha[] {
  let actuales = fichas;
  for (const par of pares) {
    const o = par.de.split(/\s+/).filter(Boolean).map(norm);
    const d = par.a.split(/\s+/).filter(Boolean);
    if (!o.length || !d.length) continue;
    const out: Ficha[] = [];
    let i = 0;
    while (i < actuales.length) {
      const tramo = actuales.slice(i, i + o.length);
      if (tramo.length === o.length && tramo.every((f, k) => norm(f.texto) === o[k])) {
        const ultimo = tramo[tramo.length - 1]!;
        const cola = /[^\p{L}\p{N}_]*$/u.exec(ultimo.texto)?.[0] ?? "";
        const textos = d.map((t, k) => t + (k === d.length - 1 ? cola : ""));
        out.push(...repartir(textos, tramo[0]!.inicio, ultimo.fin, [tramo[0]!.origen[0], ultimo.origen[1]]));
        i += o.length;
      } else {
        out.push(actuales[i]!);
        i += 1;
      }
    }
    actuales = out;
  }
  return actuales;
}

/** Corta en grupos de hasta 4 palabras, en la puntuación o en una pausa (como agrupar()). */
export function agrupar<T extends { texto: string; inicio: number; fin: number }>(fichas: T[]): T[][] {
  const grupos: T[][] = [];
  let actual: T[] = [];
  fichas.forEach((p, idx) => {
    actual.push(p);
    const sig = fichas[idx + 1];
    const corte =
      actual.length >= MAX_PALABRAS || !sig || /[.,;:!?…]$/.test(p.texto) || sig.inicio - p.fin >= PAUSA_CORTE;
    if (corte) {
      grupos.push(actual);
      actual = [];
    }
  });
  return grupos;
}

/** Corta un texto en líneas de como mucho `max` caracteres (sin partir palabras). */
export function lineas(texto: string, max: number): string[] {
  const out: string[] = [];
  let actual = "";
  for (const w of texto.split(/\s+/).filter(Boolean)) {
    if (!actual) actual = w;
    else if ((actual + " " + w).length <= max) actual += " " + w;
    else {
      out.push(actual);
      actual = w;
    }
  }
  if (actual) out.push(actual);
  return out;
}
