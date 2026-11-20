/**
 * PhotoCraft (github.com/storytold/photocraft, MIT o Apache 2.0) como motor de imágenes sin ventana.
 *
 * Geeper lo usa para llenar plantillas PSD: cada capa cuyo nombre empieza con `@` es una variable
 * (`@titulo`, `@imagen`, `@marca`…). Según la clase de capa, el valor reemplaza el texto (conserva el
 * estilo), los píxeles (escala para cubrir y recorta al centro) o el contenido de un objeto inteligente;
 * un booleano la muestra u oculta. Los ids de capa cambian al reabrir un PSD, así que siempre se leen
 * con `info` del mismo archivo justo antes de usarlos. Ver docs/PHOTOCRAFT.md.
 */
import path from "node:path";
import { correr, type Registro } from "./proceso";
import { PHOTOCRAFT_CLI } from "./rutas";

export const PREFIJO_VARIABLE = "@";

export interface Capa {
  id: number;
  nombre: string;
  /** «Type», «Pixel», «Smart Object», «Group», «Fill»… (como lo dice `info`). */
  clase: string;
  /** [x, y, ancho, alto] en píxeles del documento. */
  limites: [number, number, number, number] | null;
  /** Tamaño en pt de una capa de texto. */
  tamano?: number;
}

export interface Paso {
  cmd: string;
  params: Record<string, unknown>;
}

/** Texto (capa de texto), ruta absoluta de imagen (píxeles u objeto inteligente) o visibilidad. */
export type Valor = string | boolean;

export interface Plan {
  pasos: Paso[];
  /** Capas de texto que reciben un valor (para medir si el texto entra). */
  textos: { variable: string; capa: Capa }[];
  /** Objetos inteligentes que reciben una imagen: hay que recortarla antes a su proporción. */
  objetos: { variable: string; capa: Capa; ruta: string }[];
  /** Variables de la plantilla sin valor (quedan como están). */
  sinValor: string[];
  /** Valores sin capa en la plantilla (se ignoran). */
  sinCapa: string[];
}

type CapaInfo = { id: number; name: string; kind: string; bounds?: number[] | null; text?: { sizePt?: number }; children?: CapaInfo[] };

/** Aplana el árbol de capas de `photocraft-cli info` (los grupos traen `children`). */
export function capasDe(info: unknown): Capa[] {
  const salida: Capa[] = [];
  const recorrer = (ls: CapaInfo[] | undefined) => {
    for (const l of ls ?? []) {
      const b = l.bounds;
      salida.push({
        id: l.id,
        nombre: l.name,
        clase: l.kind,
        limites: Array.isArray(b) && b.length === 4 ? [b[0]!, b[1]!, b[2]!, b[3]!] : null,
        ...(typeof l.text?.sizePt === "number" ? { tamano: l.text.sizePt } : {}),
      });
      recorrer(l.children);
    }
  };
  recorrer((info as { layers?: CapaInfo[] }).layers);
  return salida;
}

/** Capas variables por nombre (sin el `@`). Un nombre repetido es un error de la plantilla. */
export function variablesDe(capas: Capa[]): Map<string, Capa> {
  const m = new Map<string, Capa>();
  for (const c of capas) {
    if (!c.nombre.startsWith(PREFIJO_VARIABLE)) continue;
    const nombre = c.nombre.slice(PREFIJO_VARIABLE.length).trim();
    if (!nombre) continue;
    if (m.has(nombre)) throw new Error(`La plantilla tiene dos capas «${PREFIJO_VARIABLE}${nombre}»: renombra una`);
    m.set(nombre, c);
  }
  return m;
}

/** Pasos de PhotoCraft que aplican los valores a la plantilla (función pura). */
export function planDatos(capas: Capa[], valores: Record<string, Valor>): Plan {
  const vars = variablesDe(capas);
  const defs: Record<string, unknown>[] = [];
  const datos: Record<string, unknown>[] = [];
  const plan: Plan = { pasos: [], textos: [], objetos: [], sinValor: [], sinCapa: [] };
  for (const nombre of vars.keys()) if (!(nombre in valores)) plan.sinValor.push(nombre);
  for (const [variable, valor] of Object.entries(valores)) {
    const capa = vars.get(variable);
    if (!capa) {
      plan.sinCapa.push(variable);
      continue;
    }
    if (typeof valor === "boolean") {
      defs.push({ name: variable, layer: capa.id, type: "visibility" });
      datos.push({ variable, kind: "visibility", value: valor });
      continue;
    }
    if (capa.clase === "Type") {
      defs.push({ name: variable, layer: capa.id, type: "textReplacement" });
      datos.push({ variable, kind: "text", value: valor });
      plan.textos.push({ variable, capa });
      continue;
    }
    if (capa.clase !== "Pixel" && capa.clase !== "Smart Object") {
      throw new Error(`La capa «${capa.nombre}» es de clase ${capa.clase}: una variable con texto o imagen va en una capa de texto, de píxeles o un objeto inteligente`);
    }
    if (!path.isAbsolute(valor)) throw new Error(`La imagen de «${variable}» debe ser una ruta absoluta: ${valor}`);
    if (capa.clase === "Smart Object") {
      // El reemplazo de variables de PhotoCraft sólo toca capas de píxeles (en un objeto inteligente no hace
      // nada y no avisa); el contenido se cambia con su propio comando.
      plan.pasos.push({ cmd: "layer.smartObjects.replaceContents", params: { layer: capa.id, path: valor } });
      plan.objetos.push({ variable, capa, ruta: valor });
      continue;
    }
    defs.push({ name: variable, layer: capa.id, type: "pixelReplacement", method: "fill", align: "center", clip: true });
    datos.push({ variable, kind: "pixels", value: valor });
  }
  if (defs.length) {
    plan.pasos.push(
      { cmd: "image.variables.define", params: { defs } },
      { cmd: "image.variables.dataSets", params: { dataSets: [{ name: "geeper", values: datos }] } },
      { cmd: "image.applyDataSet", params: { index: 0 } },
    );
  }
  return plan;
}

/** Tamaños que se prueban, de mayor a menor, cuando el texto no entra en su caja. */
export const ESCALAS = [1, 0.9, 0.8, 0.7, 0.6, 0.5] as const;

type InfoTexto = { text?: string; lines?: { end: number }[]; shape?: Record<string, unknown> | string | null };

/** Si un texto de párrafo perdió líneas por no caber en su caja (PhotoCraft no avisa: las omite). */
export function textoDesborda(info: InfoTexto): boolean {
  if (!info.shape || typeof info.shape !== "object" || !("Box" in info.shape)) return false; // texto de punto: siempre se dibuja entero
  const largo = Array.from(info.text ?? "").length; // los offsets son caracteres, no bytes ni UTF-16
  if (largo === 0) return false;
  const ultima = info.lines?.at(-1);
  return !ultima || ultima.end < largo;
}

export interface Resultado {
  avisos: string[];
  /** Tamaño final (pt) de cada texto que se achicó para entrar. */
  achicados: Record<string, number>;
  /** Textos que ni al 50 % entran. */
  desbordan: string[];
  sinValor: string[];
  sinCapa: string[];
}

function lineasJson(stdout: string): { command: string; result: unknown }[] {
  return stdout
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l) as { command: string; result: unknown });
}

/** Avisos de PhotoCraft que valen la pena (fuentes que faltan, etc.); el aplanado y la compresión son esperables. */
export function avisosDe(stderr: string): string[] {
  return stderr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^warning:/i.test(l) && !/layer\(s\) flattened|lossy compression/.test(l))
    .map((l) => l.replace(/^warning:\s*/i, ""));
}

function argsPasos(pasos: Paso[]): string[] {
  return pasos.flatMap((p) => ["--cmd", p.cmd, "--params", JSON.stringify(p.params)]);
}

export async function cli(args: string[], log?: Registro) {
  // Siempre en CPU: la GPU es de un trabajo a la vez (gpu-lock) y una portada tarda menos de un segundo.
  return correr(PHOTOCRAFT_CLI, args, { log, timeout: 120_000 });
}

export async function versionPhotocraft(): Promise<string | null> {
  try {
    const r = await correr(PHOTOCRAFT_CLI, ["--version"], { permitirFallo: true, timeout: 20_000 });
    return r.codigo === 0 ? r.stdout.trim() : null;
  } catch {
    return null;
  }
}

export async function leerCapas(plantilla: string): Promise<{ ancho: number; alto: number; capas: Capa[] }> {
  const r = await cli(["info", "--compact", plantilla]);
  const info = JSON.parse(r.stdout) as { width: number; height: number };
  return { ancho: info.width, alto: info.height, capas: capasDe(info) };
}

/**
 * Llena la plantilla con los valores y exporta la imagen (el formato sale de la extensión de `salida`).
 * Si un texto de párrafo no entra en su caja, lo achica de a 10 % (hasta el 50 %) antes de exportar.
 * `prepararImagen` recibe cada objeto inteligente y devuelve la ruta de la imagen ya recortada a su proporción.
 */
export async function componer(op: {
  plantilla: string;
  valores: Record<string, Valor>;
  salida: string;
  calidad?: number;
  log?: Registro;
  prepararImagen?: (ruta: string, capa: Capa) => Promise<string>;
}): Promise<Resultado> {
  const { capas } = await leerCapas(op.plantilla);
  const valores = { ...op.valores };
  if (op.prepararImagen) {
    const vars = variablesDe(capas);
    for (const [k, v] of Object.entries(valores)) {
      const capa = vars.get(k);
      if (typeof v === "string" && capa?.clase === "Smart Object") valores[k] = await op.prepararImagen(v, capa);
    }
  }
  const plan = planDatos(capas, valores);

  // 1) Medir: cada texto a los tamaños de ESCALAS (type.setStyle devuelve las líneas maquetadas).
  const medibles = plan.textos.filter((t) => t.capa.tamano);
  const achicados: Record<string, number> = {};
  const desbordan: string[] = [];
  if (medibles.length) {
    const medir: Paso[] = medibles.flatMap(({ capa }) => [
      { cmd: "type.info", params: { layer: capa.id } },
      ...ESCALAS.slice(1).map((k) => ({ cmd: "type.setStyle", params: { layer: capa.id, size: +(capa.tamano! * k).toFixed(2) } })),
    ]);
    const r = await cli(["run", op.plantilla, "--no-gpu", ...argsPasos([...plan.pasos, ...medir])], op.log);
    const medidas = lineasJson(r.stdout).filter((x) => x.command === "type.info" || x.command === "type.setStyle");
    medibles.forEach(({ variable, capa }, i) => {
      const deEsta = medidas.slice(i * ESCALAS.length, (i + 1) * ESCALAS.length);
      const cabe = deEsta.findIndex((m) => !textoDesborda(m.result as InfoTexto));
      if (cabe === -1) desbordan.push(variable);
      const k = ESCALAS[cabe === -1 ? ESCALAS.length - 1 : cabe]!;
      if (k < 1) achicados[variable] = +(capa.tamano! * k).toFixed(2);
    });
  }

  // 2) Exportar.
  const ajustes: Paso[] = medibles
    .filter(({ variable }) => achicados[variable])
    .map(({ variable, capa }) => ({ cmd: "type.setStyle", params: { layer: capa.id, size: achicados[variable] } }));
  const args = ["run", op.plantilla, "--no-gpu", ...argsPasos([...plan.pasos, ...ajustes]), "--out", op.salida, "--metadata", "none"];
  if (/\.(jpe?g|webp)$/i.test(op.salida)) args.push("--quality", String(op.calidad ?? 90));
  const r = await cli(args, op.log);
  return { avisos: avisosDe(r.stderr), achicados, desbordan, sinValor: plan.sinValor, sinCapa: plan.sinCapa };
}
