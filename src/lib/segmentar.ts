/** Cortes de escena: en los cortes de clip de MPT, corridos a la pausa entre palabras más cercana. */
import type { Palabra } from "./esquema";

export interface Tramo {
  inicio: number;
  fin: number;
  palabras: Palabra[];
}

export const VENTANA_AJUSTE = 2.0;
export const ESCENA_MINIMA = 1.5;

/**
 * Parte la voz en tramos cerca de los múltiplos de `cadaSeg` (la duración de clip de MPT). Cada corte
 * cae en el punto medio de una pausa entre palabras, así quitar o mover una escena no corta una
 * palabra a la mitad.
 */
export function segmentar(palabras: Palabra[], durVoz: number, cadaSeg: number): Tramo[] {
  // Cada límite entre palabras, con su silencio y si cierra una frase o cláusula.
  const pausas: { t: number; puntaje: number }[] = [];
  for (let i = 0; i + 1 < palabras.length; i++) {
    const a = palabras[i]!;
    const b = palabras[i + 1]!;
    const silencio = Math.max(0, b.inicio - a.fin);
    const fin = /[.!?…]$/.test(a.texto) ? 1 : /[,;:]$/.test(a.texto) ? 0.5 : 0;
    pausas.push({ t: (a.fin + Math.max(a.fin, b.inicio)) / 2, puntaje: silencio * 2 + fin });
  }
  const cortes: number[] = [];
  let ultimo = 0;
  for (let t = cadaSeg; t < durVoz - ESCENA_MINIMA; t += cadaSeg) {
    // Preferir fin de frase y silencios reales; a igualdad, el más cercano al corte de MPT.
    const cerca = pausas
      .filter((x) => Math.abs(x.t - t) <= VENTANA_AJUSTE && x.t - ultimo >= ESCENA_MINIMA && durVoz - x.t >= ESCENA_MINIMA)
      .map((x) => ({ t: x.t, v: x.puntaje - 0.15 * Math.abs(x.t - t) }))
      .sort((x, y) => y.v - x.v)[0]?.t;
    if (cerca !== undefined && !cortes.includes(cerca)) {
      cortes.push(cerca);
      ultimo = cerca;
    }
  }
  const limites = [0, ...cortes, durVoz];
  const tramos: Tramo[] = [];
  for (let i = 0; i + 1 < limites.length; i++) {
    const inicio = limites[i]!;
    const fin = limites[i + 1]!;
    tramos.push({
      inicio,
      fin,
      palabras: palabras.filter((w) => {
        const medio = (w.inicio + w.fin) / 2;
        return medio >= inicio && (medio < fin || (i + 2 === limites.length && medio <= fin + 1e-6));
      }),
    });
  }
  return tramos;
}
