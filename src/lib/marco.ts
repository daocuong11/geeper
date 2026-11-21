/**
 * Dónde va un clip con `marco` (el presentador en burbuja): dentro de la banda segura, sin tapar la marca
 * de arriba ni los subtítulos de abajo. Función pura; la usan el compilador y el panel del presentador.
 */
import type { Marco } from "./esquema";
import type { Caja, Metricas } from "./formatos";

export const MARGEN_MARCO = 24;

/** Alto del chip de la marca (texto + relleno + borde), como lo dibuja el compilador. */
const altoMarca = (m: Metricas) => Math.round(m.marcaFs * 1.2) + 30 + 4;

export function cajaMarco(marco: Marco, m: Metricas): Caja {
  const S = m.segura;
  const w = Math.round(S.w * marco.tamano);
  const h = marco.forma === "circulo" ? w : Math.round((w * 4) / 3);
  const arriba = marco.esquina.startsWith("arriba");
  const izquierda = marco.esquina.endsWith("izquierda");
  const techo = Math.max(S.y, m.marcaTop + altoMarca(m)) + MARGEN_MARCO;
  const piso = Math.min(S.y + S.h, m.subs.y) - MARGEN_MARCO;
  // Si no cabe entre la marca y los subtítulos, se achica (nunca se sale de ese espacio).
  const alto = Math.max(0, Math.min(h, piso - techo));
  const ancho = marco.forma === "circulo" ? alto : Math.min(w, Math.round((alto * 3) / 4));
  return {
    x: izquierda ? S.x + MARGEN_MARCO : S.x + S.w - MARGEN_MARCO - ancho,
    y: arriba ? techo : piso - alto,
    w: ancho,
    h: alto,
  };
}

/** CSS del recuadro (posición, tamaño, forma y un borde suave para separarlo del fondo). */
export function estiloMarco(marco: Marco, m: Metricas): string {
  const c = cajaMarco(marco, m);
  const radio = marco.forma === "circulo" ? "50%" : `${Math.round(c.w * 0.12)}px`;
  return (
    `inset: auto; left: ${c.x}px; top: ${c.y}px; width: ${c.w}px; height: ${c.h}px; border-radius: ${radio}; ` +
    `border: ${Math.max(4, Math.round(c.w * 0.015))}px solid rgba(255,255,255,0.85); box-shadow: 0 12px 40px rgba(0,0,0,0.45);`
  );
}
