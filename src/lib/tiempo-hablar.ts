/**
 * Cuánto tarda InfiniteTalk (presentador, streamer y protagonista) en la RTX 5080 a 480p, con el modelo ya
 * bajado. Función pura (la usan el servidor y los paneles).
 *
 * Medido: 3,2 s de voz → 497 s y 10,4 s → 622 s (2026-11-21); 29 s → 1368 s (streamer, 2026-11-22). Lo corto
 * lo domina la carga del modelo (~7 min); lo largo, las partes de ~3 s que genera de a una (~2 min cada una).
 *
 * Sólo 480p: es la resolución del modelo. A 720p cada parte tardó 9,5 min (29 s → ~95 min, 2026-11-23) y
 * no se ve mejor, así que no se ofrece.
 */
export function segundosHablar(segundosDeVoz: number): number {
  return Math.max(440 + 18 * segundosDeVoz, 206 + 40 * segundosDeVoz);
}

export const minutosHablar = (segundosDeVoz: number) => Math.max(8, Math.ceil(segundosHablar(segundosDeVoz) / 60));
