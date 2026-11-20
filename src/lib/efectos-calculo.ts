/**
 * Cálculos puros de efectos.ts (curvas, máscaras de transición y fórmulas de color) sin dependencias
 * de Node: los usa el compilador y también las vistas previas de la UI, así la miniatura de una
 * transición es la misma máscara que se renderiza. Procedencia: docs/EFFECTCRAFT.md.
 */
import type { Curva, TipoMascara } from "./efectos-esquema";

// ---------------------------------------------------------------- curvas (Easy Ease de After Effects)

/** Nombre del ease de GSAP de una curva (las registra `scriptEfectos`). */
export const easeDe = (c: Curva | undefined): string => (!c || c === "lineal" ? "none" : `geeper.${c}`);

/**
 * Bézier cúbica (0,0)-(x1,y1)-(x2,y2)-(1,1) como función tiempo → avance: Newton sobre x(s) y
 * bisección si Newton no converge. El script del HTML lleva la misma función (`JS_BEZIER`).
 */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const Y = (s: number) => ((ay * s + by) * s + cy) * s;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = X(s) - t;
      if (Math.abs(err) < 1e-7) return Y(s);
      const d = dX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0, hi = 1;
    s = t;
    for (let i = 0; i < 60; i++) {
      const v = X(s);
      if (Math.abs(v - t) < 1e-7) break;
      if (v < t) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return Y(s);
  };
}

/** La misma `bezier` en JavaScript plano, para el script del HTML compilado. */
export const JS_BEZIER = `function geeperBezier(x1, y1, x2, y2) {
  var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  function X(s) { return ((ax * s + bx) * s + cx) * s; }
  function dX(s) { return (3 * ax * s + 2 * bx) * s + cx; }
  function Y(s) { return ((ay * s + by) * s + cy) * s; }
  return function (t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    var s = t, i;
    for (i = 0; i < 8; i++) {
      var err = X(s) - t;
      if (Math.abs(err) < 1e-7) return Y(s);
      var d = dX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    var lo = 0, hi = 1;
    s = t;
    for (i = 0; i < 60; i++) {
      var v = X(s);
      if (Math.abs(v - t) < 1e-7) break;
      if (v < t) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return Y(s);
  };
}`;

// ---------------------------------------------------------------- utilidades numéricas

/** Normal acumulada Φ (erf de Abramowitz y Stegun 7.1.26, |error| < 1,5e-7), como en EffectCraft. */
export function normCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

const n4 = (n: number) => +n.toFixed(4);
const hexARgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];

// ---------------------------------------------------------------- transiciones con máscara

/** Encuadre de un clip en el momento de la transición (escala y desplazamiento de GSAP). */
export interface EncuadreGsap {
  scale?: number;
  xPercent?: number;
  yPercent?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Qué parte del elemento (en sus píxeles locales, W×H) se ve en el cuadro con ese encuadre. GSAP
 * traslada `xPercent` del ancho y escala desde el centro; la máscara vive en coordenadas locales y
 * se escala con el elemento, así que se ajusta a este rectángulo para que el barrido cruce el
 * cuadro y no el elemento agrandado.
 */
export function rectVisible(W: number, H: number, enc: EncuadreGsap = {}): Rect {
  const s = enc.scale && enc.scale > 0 ? enc.scale : 1;
  const tx = ((enc.xPercent ?? 0) / 100) * W;
  const ty = ((enc.yPercent ?? 0) / 100) * H;
  return { x: W / 2 + (-W / 2 - tx) / s, y: H / 2 + (-H / 2 - ty) / s, w: W / s, h: H / s };
}

export interface OpcionesTransicionMascara {
  tipo: TipoMascara;
  angulo?: number;
  suavizado?: number;
  ancho?: number;
  sentido?: "horario" | "antihorario" | "ambos";
}

export interface Mascara {
  /** CSS del elemento: la máscara depende de `--gp` (0 = no se ve nada, 1 = se ve entero). */
  estilo: string;
  desde: Record<string, number>;
  hasta: Record<string, number>;
  ease: string;
}

/** Variable que GSAP anima de 0 a 1 durante la transición. */
export const VAR_AVANCE = "--gp";
const P = `var(${VAR_AVANCE})`;
const alfa = (a: number) => `rgb(0 0 0 / ${n4(Math.min(1, Math.max(0, a)))})`;
/** Puntos de la gaussiana donde se ponen paradas (en σ). */
const ZS = [-3, -2.25, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2.25, 3];

/**
 * Máscara que revela el clip que entra. Medidas en píxeles del cuadro; `enc` es el encuadre del
 * clip al empezar la transición (Ken Burns, o la escala del fondo desenfocado).
 */
export function mascaraTransicion(o: OpcionesTransicionMascara, W: number, H: number, enc: EncuadreGsap = {}): Mascara {
  const r = rectVisible(W, H, enc);
  const s = W / r.w; // escala del elemento: px del cuadro = s · px locales
  const local = (px: number) => px / s;
  let imagen: string;
  if (o.tipo === "barrido") {
    // Visible donde d < borde (d = avance sobre el eje). EffectCraft: σ = Feather / 2,5.
    const ang = o.angulo ?? 90;
    const rad = (ang * Math.PI) / 180;
    const L = Math.abs(r.w * Math.sin(rad)) + Math.abs(r.h * Math.cos(rad));
    const sigma = Math.max(local(0.5), local((o.suavizado ?? 0) / 2.5));
    const m = 3 * sigma + 1;
    const paradas = ZS.map((z) => `${alfa(normCdf(-z))} calc(${P} * ${n4(L + 2 * m)}px - ${n4(m)}px + ${n4(z * sigma)}px)`);
    imagen = `linear-gradient(${n4(ang)}deg, ${paradas.join(", ")})`;
  } else if (o.tipo === "iris") {
    // Círculo desde el centro hasta la esquina más lejana; borde gaussiano como el barrido.
    const R = Math.hypot(r.w, r.h) / 2;
    const sigma = Math.max(local(0.5), local((o.suavizado ?? 0) / 2.5));
    const m = 3 * sigma + 1;
    const paradas = ZS.map((z) => `${alfa(normCdf(-z))} calc(${P} * ${n4(R + 2 * m)}px - ${n4(m)}px + ${n4(z * sigma)}px)`);
    imagen = `radial-gradient(circle ${n4(R + 4 * m)}px at 50% 50%, ${paradas.join(", ")})`;
  } else if (o.tipo === "radial") {
    // Cuña que crece desde el ángulo de inicio (grados horarios desde arriba, como conic-gradient).
    // El suavizado de EffectCraft es σ = 0,4·Feather en px perpendiculares al rayo; aquí se pasa a
    // grados a media distancia del centro (aproximación: el borde se ensancha hacia fuera).
    const ini = o.angulo ?? 0;
    const sentido = o.sentido ?? "horario";
    const R = Math.hypot(r.w, r.h) / 2;
    const sigmaGrados = Math.max(0.25, (((o.suavizado ?? 0) * 0.4) / s / (R / 2)) * (180 / Math.PI));
    const desde =
      sentido === "horario" ? `${n4(ini)}deg`
      : sentido === "antihorario" ? `calc(${n4(ini)}deg - ${P} * 360deg)`
      : `calc(${n4(ini)}deg - ${P} * 180deg)`;
    const m = 3 * sigmaGrados;
    // Sólo el borde que avanza es suave; el de inicio queda fijo y duro (las paradas que caen antes
    // de 0° se pegan a 0°, así en avance 0 no se ve nada).
    const paradas = ZS.map((z) => `${alfa(normCdf(-z))} calc(${P} * ${n4(360 + 2 * m)}deg - ${n4(m)}deg + ${n4(z * sigmaGrados)}deg)`);
    imagen = `conic-gradient(from ${desde} at 50% 50%, ${alfa(1)} 0deg, ${paradas.join(", ")})`;
  } else {
    // Persianas: en cada franja la parte cubierta crece de 0 al ancho completo.
    const ang = o.angulo ?? 90;
    const w = local(o.ancho ?? 60);
    imagen =
      `repeating-linear-gradient(${n4(ang)}deg, ${alfa(1)} 0px, ${alfa(1)} calc(${P} * ${n4(w)}px), ` +
      `${alfa(0)} calc(${P} * ${n4(w)}px + 1px * (1 - ${P})), ${alfa(0)} ${n4(w)}px)`;
  }
  const geo = `${n4(r.x)}px ${n4(r.y)}px / ${n4(r.w)}px ${n4(r.h)}px`;
  const estilo = `${VAR_AVANCE}: 0; -webkit-mask: ${imagen} ${geo} repeat; mask: ${imagen} ${geo} repeat;`;
  return { estilo, desde: { [VAR_AVANCE]: 0 }, hasta: { [VAR_AVANCE]: 1 }, ease: "none" };
}

// ---------------------------------------------------------------- efectos (filtros SVG)

/** Matriz 4×5 de `feColorMatrix` del tinte de After Effects (luma Rec.601, mezcla por cantidad). */
export function matrizTinte(negro: string, blanco: string, cantidad: number): number[] {
  const b = hexARgb(negro);
  const w = hexARgb(blanco);
  const a = cantidad;
  const L = [0.299, 0.587, 0.114];
  const fila = (c: number) => {
    const d = w[c]! - b[c]!;
    return [0, 1, 2].map((k) => (k === c ? 1 - a : 0) + a * d * L[k]!).concat([0, a * b[c]!]);
  };
  return [...fila(0), ...fila(1), ...fila(2), 0, 0, 0, 1, 0].map(n4);
}

/** Niveles de After Effects con los dos recortes activos (la tabla que interpola `feFuncX`). */
export function curvaNiveles(e: { entradaNegro: number; entradaBlanco: number; gamma: number; salidaNegro: number; salidaBlanco: number }, v: number): number {
  let t = (v - e.entradaNegro) / Math.max(1e-6, e.entradaBlanco - e.entradaNegro);
  t = Math.min(1, Math.max(0, t));
  return e.salidaNegro + (e.salidaBlanco - e.salidaNegro) * Math.pow(t, 1 / e.gamma);
}

/** Factor de la viñeta a una distancia `r` del centro normalizada por la semidiagonal (0..1+). */
export function factorVineta(cantidad: number, anguloGrados: number, r: number): number {
  const fov = (Math.min(179, Math.max(1e-3, anguloGrados)) * Math.PI) / 180;
  const rr = r * Math.tan(fov / 2);
  const f = Math.pow(1 / (1 + rr * rr), 2);
  return 1 - cantidad * (1 - f);
}
