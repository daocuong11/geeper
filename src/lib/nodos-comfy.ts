/**
 * «Nodos extra» de ComfyUI (código de la comunidad que piden algunas plantillas). Reglas (decisión del
 * dueño 2026-11-21, «con permiso y versión fija»):
 *  - Sólo se instala lo que está en nodos-comfy.json: una versión fija del registro oficial
 *    (api.comfy.org) que el registro tiene como «activa», con su sha256 (scripts/fijar-nodos-comfy.ts).
 *  - Nada se instala sin que la persona lo permita con un clic (se guarda en ~/geeper-data/comfy-nodos.json).
 *  - ComfyUI arranca siempre con `--disable-all-custom-nodes` y sólo carga los paquetes que pide el
 *    workflow que corre (`--whitelist-custom-nodes`).
 *  - Se instalan sus dependencias de Python (requirements.txt) con PyTorch fijado; su install.py no se corre.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { COMFYUI_DIR, COMFYUI_PYTHON } from "./comfyui";
import { entornoUv } from "./estudio";
import { bajar, extraerZip } from "./instalar-craft";
import FIJADOS from "./nodos-comfy.json";
import { correr, type Registro } from "./proceso";
import { dirDatos, UV } from "./rutas";

export interface NodoFijado {
  nombre: string;
  version: string;
  fecha: string;
  url: string;
  sha256: string;
  bytes: number;
  autor: string;
  repo: string;
  licencia: string;
  dependencias: string[];
}

type Entrada = NodoFijado | { error: string };
const TABLA = new Map<string, Entrada>(Object.entries(FIJADOS.paquetes as Record<string, Entrada>).map(([k, v]) => [k.toLowerCase(), v]));
const MARCA = ".geeper-version";

/** Nombre de la carpeta en custom_nodes (el id del registro en minúsculas: dos plantillas lo escriben distinto). */
export const carpetaNodo = (id: string) => id.toLowerCase();

export interface InfoNodo {
  id: string;
  /** null = no se puede instalar (no está en el registro o todas sus versiones están marcadas). */
  fijado: NodoFijado | null;
  motivo: string | null;
  instalado: boolean;
  permitido: boolean;
}

export function fijadoDe(id: string): { fijado: NodoFijado | null; motivo: string | null } {
  const e = TABLA.get(id.toLowerCase());
  if (!e) return { fijado: null, motivo: "No está en la lista revisada de Geeper." };
  if ("error" in e) {
    return {
      fijado: null,
      motivo: e.error.includes("404") ? "No está en el registro oficial de Comfy." : "El registro de Comfy marcó todas sus versiones en su revisión de seguridad.",
    };
  }
  return { fijado: e, motivo: null };
}

const rutaPermisos = () => path.join(dirDatos(), "comfy-nodos.json");
type Permisos = Record<string, { version: string; sha256?: string; fecha: string }>;

export async function leerPermisos(): Promise<Permisos> {
  return fs.readFile(rutaPermisos(), "utf8").then((t) => JSON.parse(t) as Permisos, () => ({}));
}

/** Guarda el permiso de la persona para instalar estos paquetes (en la versión fijada de hoy). */
export async function permitirNodos(ids: string[]): Promise<void> {
  const p = await leerPermisos();
  for (const id of ids) {
    const { fijado } = fijadoDe(id);
    if (fijado) p[carpetaNodo(id)] = { version: fijado.version, sha256: fijado.sha256, fecha: new Date().toISOString() };
  }
  await fs.mkdir(path.dirname(rutaPermisos()), { recursive: true });
  await fs.writeFile(rutaPermisos(), `${JSON.stringify(p, null, 2)}\n`);
}

/** El permiso vale para esa versión y ese archivo exactos (si la lista fijada cambia, se vuelve a pedir). */
const aprobado = (p: Permisos[string] | undefined, f: NodoFijado) => !!p && p.version === f.version && (!p.sha256 || p.sha256 === f.sha256);

/**
 * requirements.txt de la comunidad sin opciones ni URLs: sólo nombres de paquetes de PyPI (función pura).
 * Quita `--index-url`, `-e`, `-r`, `pkg @ https://…` y `git+…`, para que nada se baje de otro lado.
 */
export function requisitosSeguros(texto: string): { lineas: string[]; quitadas: string[] } {
  const lineas: string[] = [];
  const quitadas: string[] = [];
  for (const cruda of texto.split(/\r?\n/)) {
    const l = cruda.replace(/\s+#.*$/, "").trim();
    if (!l || l.startsWith("#")) continue;
    if (l.startsWith("-") || /(^|\s)@\s*\S|:\/\/|^git\+|^\.|^\/|\\/.test(l) || !/^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,._-]+\])?\s*([<>=!~].*)?(;.*)?$/.test(l)) quitadas.push(l);
    else lineas.push(l);
  }
  return { lineas, quitadas };
}

export async function versionInstalada(id: string, dir = COMFYUI_DIR): Promise<string | null> {
  return fs.readFile(path.join(dir, "custom_nodes", carpetaNodo(id), MARCA), "utf8").then((t) => t.trim(), () => null);
}

export async function infoNodos(ids: string[], dir = COMFYUI_DIR): Promise<InfoNodo[]> {
  const permisos = await leerPermisos();
  const unicos = [...new Map(ids.map((i) => [carpetaNodo(i), i])).values()];
  return Promise.all(
    unicos.map(async (id) => {
      const { fijado, motivo } = fijadoDe(id);
      const v = await versionInstalada(id, dir);
      return { id, fijado, motivo, instalado: !!fijado && v === fijado.version, permitido: !!fijado && aprobado(permisos[carpetaNodo(id)], fijado) };
    }),
  );
}

/** Instala (o actualiza a la versión fijada) un paquete ya permitido. Comprueba el sha256 antes de abrirlo. */
export async function instalarNodo(id: string, op: { log: Registro; signal?: AbortSignal; dir?: string; python?: string }): Promise<void> {
  const dir = op.dir ?? COMFYUI_DIR;
  const { fijado, motivo } = fijadoDe(id);
  if (!fijado) throw new Error(`${id}: ${motivo}`);
  if (!aprobado((await leerPermisos())[carpetaNodo(id)], fijado)) throw new Error(`${fijado.nombre}: falta tu permiso para instalarlo.`);
  if ((await versionInstalada(id, dir)) === fijado.version) return;
  op.log(`Instalando ${fijado.nombre} ${fijado.version} (de ${fijado.autor})…`);
  const r = await bajar(fijado.url);
  if (!r.ok) throw new Error(`${fijado.nombre}: el registro respondió ${r.status}`);
  const datos = Buffer.from(await r.arrayBuffer());
  const suma = createHash("sha256").update(datos).digest("hex");
  if (suma !== fijado.sha256) throw new Error(`${fijado.nombre}: el archivo bajado no es el revisado (la huella no coincide). No se instaló.`);
  const destino = path.join(dir, "custom_nodes", carpetaNodo(id));
  const tmp = await fs.mkdtemp(path.join(dir, "custom_nodes", ".nodo-"));
  try {
    const zip = path.join(tmp, "node.zip");
    await fs.writeFile(zip, datos);
    const x = path.join(tmp, "x");
    await extraerZip(zip, x);
    // Algunos zips traen una carpeta raíz; otros, los archivos sueltos.
    const dentro = await fs.readdir(x);
    const raiz = dentro.length === 1 && (await fs.stat(path.join(x, dentro[0]!))).isDirectory() ? path.join(x, dentro[0]!) : x;
    // Sin dejar el paquete sin carpeta si algo se corta: lo viejo se aparta y se borra al final.
    const viejo = `${destino}.viejo`;
    await fs.rm(viejo, { recursive: true, force: true });
    if (existsSync(destino)) await fs.rename(destino, viejo);
    try {
      await fs.rename(raiz, destino);
    } catch (e) {
      if (existsSync(viejo)) await fs.rename(viejo, destino);
      throw e;
    }
    await fs.rm(viejo, { recursive: true, force: true });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
  const req = path.join(destino, "requirements.txt");
  if (existsSync(req)) {
    const { lineas, quitadas } = requisitosSeguros(await fs.readFile(req, "utf8"));
    if (quitadas.length) op.log(`${fijado.nombre}: no se instala lo que no viene de PyPI: ${quitadas.join(" · ")}`);
    if (lineas.length) {
      op.log(`Dependencias de ${fijado.nombre}…`);
      const seguro = path.join(destino, ".geeper-requisitos.txt");
      await fs.writeFile(seguro, `${lineas.join("\n")}\n`);
      const python = op.python ?? COMFYUI_PYTHON;
      const restr = path.join(dir, "venv", "geeper-restricciones.txt");
      // Sólo PyPI; PyTorch queda fijado (las restricciones) y ya está instalado con CUDA.
      await correr(UV, ["pip", "install", "--python", python, "--index-url", "https://pypi.org/simple", "-r", seguro, ...(existsSync(restr) ? ["-c", restr] : [])], { env: entornoUv(), log: op.log, signal: op.signal, timeout: 60 * 60_000 });
    }
  }
  await fs.writeFile(path.join(destino, MARCA), `${fijado.version}\n`);
  op.log(`${fijado.nombre} listo.`);
}

/** Argumentos de ComfyUI para cargar sólo estos paquetes (función pura). */
export function argsNodos(ids: string[]): string[] {
  const carpetas = [...new Set(ids.map(carpetaNodo))];
  return ["--disable-all-custom-nodes", ...(carpetas.length ? ["--whitelist-custom-nodes", ...carpetas] : [])];
}
