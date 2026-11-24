/**
 * Color sin dependencias (sirve en el servidor y en el navegador): leer `#rgb`, `#rrggbb` y `rgba()`,
 * contraste WCAG 2.x, paleta por *median cut* y una propuesta de qué color va en cada rol de la plantilla.
 *
 * La paleta es el `color.extractTheme` de DesignCraft (`crates/engine/src/cmd/color_theme.rs:71-127`):
 * corte por la mediana ponderada en el eje de mayor rango, hasta 5 cajas, sin colores transparentes.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

export function leerColor(texto: string): Rgba | null {
  const t = texto.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(t);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const f = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(t);
  if (f) {
    const c = (x: string) => Math.max(0, Math.min(255, Math.round(Number(x))));
    return { r: c(f[1]!), g: c(f[2]!), b: c(f[3]!), a: f[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(f[4]))) };
  }
  return null;
}

const dos = (n: number) => Math.round(n).toString(16).padStart(2, "0");

export function aHex(c: Pick<Rgba, "r" | "g" | "b">): string {
  return `#${dos(c.r)}${dos(c.g)}${dos(c.b)}`;
}

/** `#rrggbb` si es opaco; `rgba(r, g, b, a)` si no (lo que acepta el esquema de plantillas). */
export function aTexto(c: Rgba): string {
  return c.a >= 1 ? aHex(c) : `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Number(c.a.toFixed(2))})`;
}

/** Un color con transparencia pintado sobre un fondo opaco. */
export function sobre(c: Rgba, fondo: Rgba): Rgba {
  const m = (x: number, y: number) => x * c.a + y * (1 - c.a);
  return { r: m(c.r, fondo.r), g: m(c.g, fondo.g), b: m(c.b, fondo.b), a: 1 };
}

/** Luminancia relativa WCAG 2.x (0 = negro, 1 = blanco). */
export function luminancia(c: Pick<Rgba, "r" | "g" | "b">): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

export function contraste(a: Pick<Rgba, "r" | "g" | "b">, b: Pick<Rgba, "r" | "g" | "b">): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const BLANCO: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const NEGRO: Rgba = { r: 0, g: 0, b: 0, a: 1 };

/**
 * Contraste del texto sobre un fondo que puede ser semitransparente. Debajo está el video, que puede
 * ser claro u oscuro: se toma el peor caso entre un cuadro blanco y uno negro.
 */
export function contrastePeor(texto: string, fondo: string): number | null {
  const t = leerColor(texto);
  const f = leerColor(fondo);
  if (!t || !f) return null;
  return Math.min(...[BLANCO, NEGRO].map((v) => contraste(sobre(t, sobre(f, v)), sobre(f, v))));
}

export type Legibilidad = "bien" | "justo" | "mal";

/** Texto grande y grueso (subtítulos, títulos): WCAG pide ≥ 3:1; ≥ 4,5:1 se lee cómodo. */
export function legibilidad(ratio: number): Legibilidad {
  return ratio >= 4.5 ? "bien" : ratio >= 3 ? "justo" : "mal";
}

// ---- Paleta desde una imagen.

/** Una muestra: color y su peso (el alfa del píxel; los transparentes no entran). */
export type Muestra = [r: number, g: number, b: number, peso: number];

export interface ColorPaleta {
  hex: string;
  /** Fracción de la imagen (0..1) que representa. */
  parte: number;
}

/** Muestras RGBA (4 bytes por píxel, como `ffmpeg -f rawvideo -pix_fmt rgba`). */
export function muestrasRgba(datos: Uint8Array): Muestra[] {
  const out: Muestra[] = [];
  for (let i = 0; i + 3 < datos.length; i += 4) {
    const a = datos[i + 3]!;
    if (a > 0) out.push([datos[i]!, datos[i + 1]!, datos[i + 2]!, a]);
  }
  return out;
}

/** Median cut ponderado: hasta `max` colores, del más presente al menos; determinista. */
export function paleta(muestras: Muestra[], max = 5): ColorPaleta[] {
  if (!muestras.length) return [];
  const pesoDe = (caja: Muestra[]) => caja.reduce((s, m) => s + m[3], 0);
  const rango = (caja: Muestra[]): [number, number] => {
    let mejor: [number, number] = [0, 0];
    for (let eje = 0; eje < 3; eje++) {
      let lo = 255;
      let hi = 0;
      for (const m of caja) {
        lo = Math.min(lo, m[eje]!);
        hi = Math.max(hi, m[eje]!);
      }
      if (hi - lo > mejor[0]) mejor = [hi - lo, eje];
    }
    return mejor;
  };
  const cajas: Muestra[][] = [muestras];
  while (cajas.length < max) {
    // La caja que más «pesa» por su rango se parte primero (como DesignCraft: rango × peso).
    let elegida = -1;
    let eje = 0;
    let valor = 0;
    cajas.forEach((c, i) => {
      const [r, e] = rango(c);
      const v = r * pesoDe(c);
      if (r > 0 && v > valor) [elegida, eje, valor] = [i, e, v];
    });
    if (elegida < 0) break;
    const caja = cajas.splice(elegida, 1)[0]!.slice().sort((a, b) => a[eje]! - b[eje]!);
    const mitad = pesoDe(caja) / 2;
    let acumulado = 0;
    let corte = 1;
    for (let i = 0; i < caja.length - 1; i++) {
      acumulado += caja[i]![3];
      corte = i + 1;
      if (acumulado >= mitad) break;
    }
    cajas.push(caja.slice(0, corte), caja.slice(corte));
  }
  const total = pesoDe(muestras);
  const porHex = new Map<string, number>();
  for (const caja of cajas) {
    const w = pesoDe(caja);
    if (!w) continue;
    const prom = (eje: number) => caja.reduce((s, m) => s + m[eje]! * m[3], 0) / w;
    const hex = aHex({ r: prom(0), g: prom(1), b: prom(2) });
    porHex.set(hex, (porHex.get(hex) ?? 0) + w / total);
  }
  return [...porHex].map(([hex, parte]) => ({ hex, parte })).sort((a, b) => b.parte - a.parte || a.hex.localeCompare(b.hex));
}

// ---- Qué color va en cada rol.

function hsl(c: Pick<Rgba, "r" | "g" | "b">): { h: number; s: number; l: number } {
  const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** Qué tan «de marca» es un color: saturado y ni casi blanco ni casi negro. */
function viveza(hex: string): number {
  const c = leerColor(hex)!;
  const { s, l } = hsl(c);
  return s * (1 - Math.abs(2 * l - 1));
}

const distanciaTono = (a: string, b: string) => {
  const d = Math.abs(hsl(leerColor(a)!).h - hsl(leerColor(b)!).h);
  return Math.min(d, 360 - d);
};

export interface Roles {
  acento1?: string;
  acento2?: string;
  activa?: string;
}

/**
 * Propuesta de roles desde una paleta: acento 1 = el color de marca más presente; acento 2 = otro de
 * tono distinto (o una variante del primero); palabra activa = el más vivo que se lea sobre la pastilla.
 * Sólo propone: la persona confirma. Devuelve sólo los roles que pudo llenar.
 */
export function proponerRoles(colores: ColorPaleta[], fondoPastilla = "rgba(8, 8, 18, 0.62)"): Roles {
  const vivos = colores.filter((c) => viveza(c.hex) >= 0.18);
  const puntaje = (c: ColorPaleta) => viveza(c.hex) * (0.35 + c.parte);
  const orden = [...vivos].sort((a, b) => puntaje(b) - puntaje(a));
  const out: Roles = {};
  const a1 = orden[0];
  if (!a1) return out;
  out.acento1 = a1.hex;
  const a2 = orden.find((c) => c !== a1 && distanciaTono(c.hex, a1.hex) >= 25) ?? orden.find((c) => c !== a1);
  if (a2) out.acento2 = a2.hex;
  const legibles = orden
    .map((c) => ({ c, k: contrastePeor(c.hex, fondoPastilla) ?? 0 }))
    .filter((x) => x.k >= 3)
    .sort((x, y) => viveza(y.c.hex) * Math.min(y.k, 7) - viveza(x.c.hex) * Math.min(x.k, 7));
  if (legibles[0]) out.activa = legibles[0].c.hex;
  return out;
}
