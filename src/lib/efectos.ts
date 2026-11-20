/**
 * Efectos, transiciones con máscara, modos de fusión y curvas de movimiento para el compilador a
 * Hyperframes.
 *
 * Las fórmulas vienen de EffectCraft (https://github.com/storytold/effectcraft, MIT o Apache-2.0,
 * © sus autores), que las ajustó contra renders de After Effects 2026. Aquí se traducen a lo que
 * Chrome pinta en cada fotograma: filtros SVG, máscaras CSS y curvas de GSAP. Detalle de qué se
 * tomó y qué no en docs/EFFECTCRAFT.md.
 *
 * - Tinte (`ec.color.tint`): luma Rec.601 llevada entre dos colores → `feColorMatrix` exacto.
 * - Niveles (`ec.color.levels`): (v − negro)/(blanco − negro) recortado, ^(1/gamma), a la salida →
 *   `feComponentTransfer` por tabla.
 * - Viñeta (`ec.stylize.ccvignette`): k = 1 − cantidad·(1 − (1/(1+r²))²), r = distancia /
 *   (semidiagonal / tan(ángulo/2)) → mapa radial multiplicado con `feComposite`.
 * - Grano (`ec.noise.noise`): c + cantidad·(n − ½), recortado → mosaico de ruido fijo que salta a
 *   otra posición en cada fotograma (determinista: no depende de `feTurbulence` ni del reloj).
 * - Barrido lineal (`ec.transition.linearwipe`): eje (sen a, −cos a), borde sobre la proyección de
 *   las esquinas, suavizado gaussiano σ = suavizado/2,5 → paradas de un `linear-gradient` que siguen
 *   la normal acumulada (Φ), no una rampa lineal.
 * - Barrido radial (`ec.transition.radialwipe`), iris y persianas (`ec.transition.venetian`).
 */
import zlib from "node:zlib";
import { CURVAS, type Efecto } from "./efectos-esquema";
import { curvaNiveles, factorVineta, JS_BEZIER, matrizTinte } from "./efectos-calculo";

export { CURVAS, cssFusion, esMascara, type Efecto } from "./efectos-esquema";
export * from "./efectos-calculo";

const n4 = (n: number) => +n.toFixed(4);

/** Generador pseudoaleatorio determinista (mulberry32). */
export function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lado del mosaico de grano en píxeles. */
export const LADO_GRANO = 192;

/** PNG RGB de ruido uniforme (gris si `color` es falso), como data URI. Siempre el mismo para la misma semilla. */
export function pngRuido(semilla: number, color: boolean, lado = LADO_GRANO): string {
  const rnd = aleatorio(semilla);
  const fila = 1 + lado * 3;
  const crudo = Buffer.alloc(fila * lado);
  for (let y = 0; y < lado; y++) {
    crudo[y * fila] = 0;
    for (let x = 0; x < lado; x++) {
      const o = y * fila + 1 + x * 3;
      const g = Math.floor(rnd() * 256);
      crudo[o] = g;
      crudo[o + 1] = color ? Math.floor(rnd() * 256) : g;
      crudo[o + 2] = color ? Math.floor(rnd() * 256) : g;
    }
  }
  const trozo = (tipo: string, datos: Buffer) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([largo, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", zlib.deflateSync(crudo, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Movimiento del grano de un clip: el script mueve el mosaico a otra posición en cada fotograma. */
export interface Grano {
  /** id del `<feImage>` que se mueve. */
  id: string;
  /** Segundos (línea final) en que empieza y cuánto dura el clip. */
  t: number;
  dur: number;
  semilla: number;
}

export interface FiltroClip {
  /** `<filter>` para el `<defs>` común (vacío si el clip no tiene efectos SVG). */
  defs: string;
  /** Valor de `filter:` que sigue al ajuste de color (url del SVG y blur). */
  css: string;
  granos: Grano[];
}

/**
 * Filtro de los efectos de un clip, en el orden en que se listan (como la pila de efectos de After
 * Effects). `W`×`H` es el tamaño local del elemento. Todo en sRGB, que es como EffectCraft y After
 * Effects aplican estos efectos sin espacio de trabajo lineal.
 */
export function filtroEfectos(id: string, efectos: Efecto[] | undefined, W: number, H: number, ventana?: { t: number; dur: number }): FiltroClip {
  const lista = efectos ?? [];
  const prims: string[] = [];
  const granos: Grano[] = [];
  let entrada = "SourceGraphic";
  let n = 0;
  const sig = () => `r${n++}`;
  let blur = 0;
  for (const ef of lista) {
    if (ef.tipo === "desenfoque") {
      // El desenfoque va fuera del SVG (filter: blur) para no recortarse en los bordes de la región.
      blur += ef.radio;
      continue;
    }
    const out = sig();
    if (ef.tipo === "tinte") {
      if (ef.cantidad === 0) continue;
      prims.push(`<feColorMatrix in="${entrada}" type="matrix" values="${matrizTinte(ef.negro, ef.blanco, ef.cantidad).join(" ")}" result="${out}"/>`);
    } else if (ef.tipo === "niveles") {
      const tabla = Array.from({ length: 65 }, (_, i) => n4(curvaNiveles(ef, i / 64))).join(" ");
      const f = (c: string) => `<feFunc${c} type="table" tableValues="${tabla}"/>`;
      prims.push(`<feComponentTransfer in="${entrada}" result="${out}">${f("R")}${f("G")}${f("B")}</feComponentTransfer>`);
    } else if (ef.tipo === "vineta") {
      if (ef.cantidad === 0) continue;
      const paradas = Array.from({ length: 13 }, (_, i) => {
        const o = i / 12;
        const k = Math.round(Math.min(1, Math.max(0, factorVineta(ef.cantidad, ef.angulo, o))) * 255);
        return `<stop offset="${n4(o)}" stop-color="rgb(${k},${k},${k})"/>`;
      }).join("");
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
        `<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${W / 2}" cy="${H / 2}" r="${n4(Math.hypot(W, H) / 2)}">${paradas}</radialGradient>` +
        `<rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
      const mapa = sig();
      prims.push(
        `<feImage href="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="${mapa}"/>`,
        `<feComposite in="${entrada}" in2="${mapa}" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="${out}"/>`,
      );
    } else if (ef.tipo === "grano") {
      if (ef.cantidad === 0) continue;
      const imgId = `${id}-grano${granos.length}`;
      const tesela = sig();
      const mos = sig();
      const suma = sig();
      prims.push(
        `<feImage id="${imgId}" href="${pngRuido(ef.semilla, ef.color)}" x="0" y="0" width="${LADO_GRANO}" height="${LADO_GRANO}" preserveAspectRatio="none" result="${tesela}"/>`,
        `<feTile in="${tesela}" result="${mos}"/>`,
        `<feComposite in="${entrada}" in2="${mos}" operator="arithmetic" k1="0" k2="1" k3="${n4(ef.cantidad)}" k4="${n4(-ef.cantidad / 2)}" result="${suma}"/>`,
        `<feComposite in="${suma}" in2="SourceGraphic" operator="in" result="${out}"/>`,
      );
      if (ventana) granos.push({ id: imgId, t: ventana.t, dur: ventana.dur, semilla: ef.semilla });
    }
    entrada = out;
  }
  const fid = `fx-${id}`;
  const defs = prims.length
    ? `<filter id="${esc(fid)}" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${prims.join("")}</filter>`
    : "";
  const css = [defs ? `url(#${fid})` : "", blur > 0 ? `blur(${n4(blur)}px)` : ""].filter(Boolean).join(" ");
  return { defs, css, granos };
}

/** Une el `filter:` de color de un clip con el de sus efectos. */
export function unirFiltro(estiloColor: string, fx: FiltroClip): string {
  if (!fx.css) return estiloColor;
  const m = /filter:\s*([^;]*);/.exec(estiloColor);
  if (!m) return `${estiloColor} filter: ${fx.css};`.trim();
  return estiloColor.replace(m[0], `filter: ${m[1]} ${fx.css};`);
}

/** `<svg>` invisible con los filtros de todos los clips (vacío si no hay). */
export function svgDefs(defs: string[]): string {
  const d = defs.filter(Boolean);
  if (!d.length) return "";
  return `      <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${d.join("")}</defs></svg>`;
}

/**
 * Script que se ejecuta con la línea de tiempo `tl` ya creada: registra las curvas y mueve el grano
 * fotograma a fotograma (posiciones de una secuencia fija por semilla: el mismo render siempre da
 * los mismos píxeles).
 */
export function scriptEfectos(granos: Grano[], fps: number): string {
  const curvas = Object.entries(CURVAS)
    .filter(([, v]) => v)
    .map(([k, v]) => `gsap.registerEase(${JSON.stringify(`geeper.${k}`)}, geeperBezier(${(v as readonly number[]).join(", ")}));`)
    .join("\n      ");
  const datos = JSON.stringify(granos.map((g) => ({ id: g.id, t: +g.t.toFixed(4), n: Math.max(1, Math.ceil(g.dur * fps)), s: g.semilla }))).replace(/</g, "\\u003c");
  return `${JS_BEZIER}
      ${curvas}
      // Grano: el mosaico salta a una posición distinta en cada fotograma.
      ${datos}.forEach(function (g) {
        var el = document.getElementById(g.id);
        if (!el) return;
        var a = (g.s * 2654435761) >>> 0;
        for (var i = 0; i < g.n; i++) {
          a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
          var x = a % ${LADO_GRANO};
          a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
          var y = a % ${LADO_GRANO};
          tl.set(el, { attr: { x: x, y: y } }, g.t + i / ${fps});
        }
      });`;
}
