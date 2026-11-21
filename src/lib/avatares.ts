/**
 * Avatares: un personaje (realista o animado) que se crea una vez y después habla en los videos con la
 * voz del proyecto (presentador.ts). Todo corre en esta PC con Wan2GP, que Geeper ya usa para animar
 * escenas (wan2gp.ts):
 *
 *  - **Retratos** desde una descripción: Z-Image Turbo (`z_image`, Apache-2.0), 4 tomas para elegir.
 *  - **Desde una foto** o **retocar** («ponle lentes», «fondo de oficina»): Qwen Image Edit Plus 2511
 *    (`qwen_image_edit_plus2_20B`, Apache-2.0) con su acelerador Lightning de 4 pasos (Apache-2.0), que
 *    conserva la identidad de la persona del retrato.
 *  - **Hablar**: InfiniteTalk (Wan 2.1 I2V 14B + MeiGen-AI/InfiniteTalk, Apache-2.0) con el acelerador
 *    lightx2v de 4 pasos (Apache-2.0), en presentador.ts.
 *
 * Idea de los workflows oficiales de ComfyUI (`video_wan2_1_infinitetalk`, `templates-1_click_multiple_
 * character_angles`), hechos con los mismos modelos en Wan2GP para no duplicar 30 GB de pesos.
 *
 * Biblioteca en `~/geeper-data/avatares/<id>/` (avatar.json, retrato.png y las versiones anteriores).
 * Una foto de una persona real sólo entra con su consentimiento, que queda escrito en avatar.json.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Contexto } from "./pasos";
import { correr } from "./proceso";
import { LOOKS, LUCES } from "./prompt-camara";
import { dirDatos, FFMPEG } from "./rutas";
import { generarImagenes, instalacionWan2gp, probarWan2gp, type AjustesWan2gp, type Avance } from "./wan2gp";

export const MAX_DESCRIPCION = 600;
export const TOMAS = 4;
/** Vertical, como los retratos de MPT: sirve en 9:16 y, recortado, en la burbuja. */
export const RESOLUCION_RETRATO = "832x1216";

export const MODELO_RETRATO = "z_image";
export const MODELO_RETOQUE = "qwen_image_edit_plus2_20B";
/** Acelerador de Qwen Edit 2511 (perfil «Lightning Qwen Edit 2511 - 4 Steps» de Wan2GP). */
export const LORA_RETOQUE = "https://huggingface.co/DeepBeepMeep/Qwen_image/resolve/main/loras_accelerators/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors";

export const LICENCIA_RETRATO = "Apache-2.0 (Tongyi-MAI/Z-Image-Turbo); generado con WanGP";
export const LICENCIA_RETOQUE = "Apache-2.0 (Qwen/Qwen-Image-Edit-2511 + lightx2v/Qwen-Image-Edit-2511-Lightning); generado con WanGP";

/** Estilos a la vista de la persona; al modelo va el texto en inglés. */
export const ESTILOS = {
  realista: {
    nombre: "Realista",
    detalle: "Como una foto",
    prompt: "photorealistic studio portrait photograph, natural skin texture, sharp focus, 85mm lens",
  },
  "animado-3d": {
    nombre: "Animado 3D",
    detalle: "Como una película animada",
    prompt: "stylized 3D animated character, feature animation film style, soft subsurface shading, expressive eyes, clean render",
  },
  anime: {
    nombre: "Anime",
    detalle: "Dibujo japonés",
    prompt: "anime style character illustration, clean cel shading, crisp line art, vibrant colors",
  },
  caricatura: {
    nombre: "Caricatura",
    detalle: "Dibujo animado 2D",
    prompt: "2D cartoon character, bold clean outlines, flat colors, friendly mascot style",
  },
  ilustracion: {
    nombre: "Ilustración",
    detalle: "Pintura digital",
    prompt: "digital painting illustration, painterly brush strokes, storybook style, rich colors",
  },
  plastilina: {
    nombre: "Plastilina",
    detalle: "Muñeco de stop motion",
    prompt: "claymation character, handmade plasticine texture, stop-motion animation look",
  },
} as const;
export type Estilo = keyof typeof ESTILOS;
export const EstiloZ = z.enum(Object.keys(ESTILOS) as [Estilo, ...Estilo[]]);

export const FONDOS = {
  liso: { nombre: "Liso", prompt: "plain softly blurred neutral background" },
  estudio: { nombre: "Estudio", prompt: "softly lit studio background with subtle gradient" },
  oficina: { nombre: "Oficina", prompt: "blurred modern office in the background" },
  casa: { nombre: "Casa", prompt: "blurred cozy living room in the background" },
  exterior: { nombre: "Al aire libre", prompt: "blurred outdoor park in the background, daylight" },
} as const;
export type Fondo = keyof typeof FONDOS;
export const FondoZ = z.enum(Object.keys(FONDOS) as [Fondo, ...Fondo[]]);

/**
 * Lo que necesita InfiniteTalk para que la boca se mueva bien: la cara de frente, mirando a cámara, boca
 * cerrada y relajada (el modelo la abre), hombros a la vista y nada tapando la cara.
 */
export const ENCUADRE_AVATAR =
  "head and shoulders portrait, centered, facing the camera, looking straight at the viewer, mouth closed and relaxed, " +
  "neutral friendly expression, both eyes visible, face fully visible and unobstructed, no hands near the face, no text, no watermark";

export const Pedido = z.object({
  descripcion: z.string().trim().max(MAX_DESCRIPCION).default(""),
  estilo: EstiloZ.default("realista"),
  fondo: FondoZ.default("liso"),
  luz: z.enum(Object.keys(LUCES) as [keyof typeof LUCES, ...(keyof typeof LUCES)[]]).optional(),
  look: z.enum(Object.keys(LOOKS) as [keyof typeof LOOKS, ...(keyof typeof LOOKS)[]]).optional(),
  semilla: z.number().int().min(0).max(2147483647).optional(),
});
export type Pedido = z.infer<typeof Pedido>;

/** Prompt del retrato (función pura). */
export function promptRetrato(p: Pedido): string {
  const partes = [
    ESTILOS[p.estilo].prompt,
    p.descripcion.trim(),
    ENCUADRE_AVATAR,
    FONDOS[p.fondo].prompt,
    p.luz ? LUCES[p.luz] : "soft even studio lighting",
    p.look ? LOOKS[p.look] : "",
  ];
  return partes.filter(Boolean).join(". ");
}

/** Instrucción para Qwen Edit cuando el avatar sale de una foto (función pura). */
export function promptDesdeFoto(p: Pedido): string {
  const estilo =
    p.estilo === "realista"
      ? "Keep the person photorealistic and keep their face, identity, age and features exactly the same"
      : `Turn the person in the picture into a ${ESTILOS[p.estilo].prompt}, keeping their recognizable features, hairstyle and identity`;
  return [estilo, p.descripcion.trim(), `Reframe as a ${ENCUADRE_AVATAR}`, `Replace the background with a ${FONDOS[p.fondo].prompt}`, p.luz ? LUCES[p.luz] : "", p.look ? LOOKS[p.look] : ""]
    .filter(Boolean)
    .join(". ");
}

/** Instrucción de retoque: lo que pide la persona, conservando la cara y el encuadre (función pura). */
export function promptRetoque(instruccion: string): string {
  return `${instruccion.trim()}. Keep the same character, face, identity, art style, framing and camera angle. Keep the mouth closed and relaxed, facing the camera.`;
}

const semillaDe = (s?: number) => (s !== undefined && s >= 0 ? Math.round(s) : Math.floor(Math.random() * 2147483647));

export function ajustesRetratos(p: Pedido, cantidad = TOMAS): AjustesWan2gp {
  if (!p.descripcion.trim()) throw new Error("Describe a tu avatar: cómo es, qué edad tiene, cómo se viste…");
  return {
    model_type: MODELO_RETRATO,
    image_mode: 1,
    prompt: promptRetrato(p),
    resolution: RESOLUCION_RETRATO,
    batch_size: cantidad,
    seed: semillaDe(p.semilla),
  };
}

/** Qwen Edit con una o varias imágenes de referencia (la primera es el sujeto principal). */
export function ajustesEdicion(prompt: string, referencias: string[], semilla?: number, cantidad = 1): AjustesWan2gp {
  if (!referencias.length) throw new Error("Falta la imagen de referencia");
  return {
    model_type: MODELO_RETOQUE,
    image_mode: 1,
    prompt,
    resolution: RESOLUCION_RETRATO,
    video_prompt_type: "KI",
    image_refs: referencias,
    batch_size: cantidad,
    activated_loras: [LORA_RETOQUE],
    loras_multipliers: "1",
    num_inference_steps: 4,
    guidance_scale: 1,
    seed: semillaDe(semilla),
  };
}

// ---------------------------------------------------------------------------------------------------
// Biblioteca

export const Version = z.object({ archivo: z.string(), nota: z.string(), fecha: z.string() });

/** La voz con la que habla el avatar: una de Kokoro o una diseñada de la biblioteca (voces.ts). */
export const VozAvatar = z.object({ motor: z.enum(["kokoro", "voxcpm"]), voz: z.string().min(1).max(80), nombre: z.string().min(1).max(60) });
export type VozAvatar = z.infer<typeof VozAvatar>;

export const Avatar = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nombre: z.string().min(1).max(60),
  descripcion: z.string().max(MAX_DESCRIPCION),
  estilo: EstiloZ,
  origen: z.enum(["descripcion", "foto"]),
  /** Con foto: lo que confirmó la persona, palabra por palabra, y cuándo. */
  consentimiento: z.object({ texto: z.string(), fecha: z.string() }).optional(),
  voz: VozAvatar.optional(),
  /** Retratos anteriores (el actual es retrato.png), del más viejo al más nuevo. */
  versiones: z.array(Version).default([]),
  creado: z.string(),
  actualizado: z.string(),
  licencia: z.string(),
});
export type Avatar = z.infer<typeof Avatar>;

export const dirAvatares = () => path.join(dirDatos(), "avatares");
export const dirAvatar = (id: string) => {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Avatar inválido");
  return path.join(dirAvatares(), id);
};
const dirPropuesta = (id: string) => {
  if (!/^[a-z0-9]+$/.test(id)) throw new Error("Propuesta inválida");
  return path.join(dirAvatares(), "_propuestas", id);
};
/** Ruta relativa a ~/geeper-data (para /api/archivos). */
export const relativaADatos = (abs: string) => path.relative(dirDatos(), abs).split(path.sep).join("/");
export const rutaRetrato = (id: string) => path.join(dirAvatar(id), "retrato.png");

export const TEXTO_CONSENTIMIENTO =
  "La persona de la foto soy yo, o tengo su permiso por escrito para crear un avatar con su cara y usarlo en videos.";

export const nuevaPropuesta = () => randomBytes(6).toString("hex");

/** «Doctora Sofía» → «doctora-sofia-3fa2». */
export function idDeAvatar(nombre: string, sufijo = randomBytes(2).toString("hex")): string {
  const base = nombre
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "avatar"}-${sufijo}`;
}

export async function listarAvatares(): Promise<Avatar[]> {
  let entradas: string[] = [];
  try {
    entradas = await fs.readdir(dirAvatares());
  } catch {
    return [];
  }
  const out: Avatar[] = [];
  for (const e of entradas) {
    if (e.startsWith("_")) continue;
    try {
      out.push(Avatar.parse(JSON.parse(await fs.readFile(path.join(dirAvatares(), e, "avatar.json"), "utf8"))));
    } catch {
      /* carpeta ajena o a medio escribir */
    }
  }
  return out.sort((a, b) => b.actualizado.localeCompare(a.actualizado));
}

export async function leerAvatar(id: string): Promise<Avatar> {
  try {
    return Avatar.parse(JSON.parse(await fs.readFile(path.join(dirAvatar(id), "avatar.json"), "utf8")));
  } catch {
    throw new Error(`El avatar «${id}» ya no está en la biblioteca: elige otro.`);
  }
}

async function escribirAvatar(a: Avatar) {
  const dir = dirAvatar(a.id);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `avatar.json.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(Avatar.parse(a), null, 2));
  await fs.rename(tmp, path.join(dir, "avatar.json"));
}

export interface PedidoPropuesta {
  pedido: Pedido;
  /** Ruta absoluta de la foto subida (avatar desde una foto). */
  foto?: string;
  consentimiento?: { texto: string; fecha: string };
}

export interface Propuesta extends PedidoPropuesta {
  id: string;
  tomas: string[];
  creada: string;
}

/** Guarda lo pedido antes de encolar (la foto se copia a la propuesta). */
export async function crearPropuesta(p: PedidoPropuesta): Promise<string> {
  if (p.foto && !p.consentimiento) throw new Error("Para usar una foto, confirma que es tuya o que tienes permiso de la persona.");
  if (!p.foto && !p.pedido.descripcion.trim()) throw new Error("Describe a tu avatar o sube una foto.");
  const id = nuevaPropuesta();
  const dir = dirPropuesta(id);
  await fs.mkdir(dir, { recursive: true });
  let foto: string | undefined;
  if (p.foto) {
    foto = path.join(dir, `foto${path.extname(p.foto).toLowerCase() || ".png"}`);
    await fs.copyFile(p.foto, foto);
  }
  await fs.writeFile(path.join(dir, "pedido.json"), JSON.stringify({ ...p, foto, creada: new Date().toISOString() }, null, 2));
  return id;
}

export async function leerPropuesta(id: string): Promise<Propuesta | null> {
  let dir: string;
  try {
    dir = dirPropuesta(id);
  } catch {
    return null;
  }
  try {
    const base = JSON.parse(await fs.readFile(path.join(dir, "pedido.json"), "utf8")) as PedidoPropuesta & { creada: string };
    const tomas = (await fs.readdir(dir)).filter((f) => /^toma-\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    return { ...base, pedido: Pedido.parse(base.pedido), id, tomas: tomas.map((t) => relativaADatos(path.join(dir, t))) };
  } catch {
    return null;
  }
}

export interface ContextoAvatar extends Contexto {
  signal?: AbortSignal;
  alAvanzar?: (a: Avance) => void;
}

/** Copia las imágenes de Wan2GP como toma-1.png, toma-2.png… (en PNG aunque Wan2GP guarde otro formato). */
async function guardarTomas(imagenes: string[], dir: string, desde: number): Promise<void> {
  for (const [k, img] of imagenes.entries()) {
    const destino = path.join(dir, `toma-${desde + k}.png`);
    if (path.extname(img).toLowerCase() === ".png") await fs.copyFile(img, destino);
    else await correr(FFMPEG, ["-v", "error", "-y", "-i", img, destino]);
  }
}

function ajustesDePropuesta(pr: Propuesta): AjustesWan2gp {
  if (pr.foto) return ajustesEdicion(promptDesdeFoto(pr.pedido), [pr.foto], pr.pedido.semilla, 2);
  return ajustesRetratos(pr.pedido);
}

/** Genera las tomas de una propuesta (usa toda la GPU). Con foto salen 2; desde una descripción, 4. */
export async function generarPropuesta(ctx: ContextoAvatar, id: string): Promise<{ tomas: string[] }> {
  const pr = await leerPropuesta(id);
  if (!pr) throw new Error("Esa propuesta de avatar ya no existe: vuelve a describirlo.");
  const dir = dirPropuesta(id);
  const ajustes = ajustesDePropuesta(pr);
  ctx.log(`Avatar: ${ajustes.model_type}, ${ajustes.batch_size} tomas. Prompt: ${ajustes.prompt}`);
  const imagenes = await generarImagenes({ instalacion: instalacionWan2gp(), ajustes, dirCorrida: path.join(dir, "wan2gp", new Date().toISOString().replace(/[:.]/g, "-")), signal: ctx.signal, log: ctx.log, alAvanzar: ctx.alAvanzar });
  await guardarTomas(imagenes, dir, pr.tomas.length + 1);
  return { tomas: (await leerPropuesta(id))!.tomas };
}

/** Valida los ajustes de una propuesta con `wgp.py --dry-run` (sin GPU). */
export async function probarPropuesta(id: string) {
  const pr = await leerPropuesta(id);
  if (!pr) throw new Error("Esa propuesta de avatar ya no existe.");
  return probarWan2gp(instalacionWan2gp(), ajustesDePropuesta(pr), path.join(dirPropuesta(id), "prueba"));
}

/** Guarda una toma de la propuesta como avatar nuevo de la biblioteca. */
export async function guardarAvatar(propuesta: string, toma: number, nombre: string, voz?: VozAvatar): Promise<Avatar> {
  const pr = await leerPropuesta(propuesta);
  if (!pr) throw new Error("Esa propuesta ya no existe: vuelve a crear el avatar.");
  const archivo = path.join(dirPropuesta(propuesta), `toma-${toma}.png`);
  if (!existsSync(archivo)) throw new Error("Esa toma no existe.");
  const ahora = new Date().toISOString();
  const a: Avatar = {
    id: idDeAvatar(nombre),
    nombre: nombre.trim(),
    descripcion: pr.pedido.descripcion,
    estilo: pr.pedido.estilo,
    origen: pr.foto ? "foto" : "descripcion",
    consentimiento: pr.consentimiento,
    voz,
    versiones: [],
    creado: ahora,
    actualizado: ahora,
    licencia: pr.foto ? `foto propia o con permiso («${pr.consentimiento?.texto ?? ""}», ${pr.consentimiento?.fecha ?? ""}); ${LICENCIA_RETOQUE}` : LICENCIA_RETRATO,
  };
  await fs.mkdir(dirAvatar(a.id), { recursive: true });
  await fs.copyFile(archivo, rutaRetrato(a.id));
  if (pr.foto) await fs.copyFile(pr.foto, path.join(dirAvatar(a.id), `foto-original${path.extname(pr.foto)}`));
  await escribirAvatar(a);
  return a;
}

/** Retoca el retrato con una instrucción y lo deja como el actual; el anterior queda en las versiones. */
export async function retocarAvatar(ctx: ContextoAvatar, id: string, instruccion: string, semilla?: number): Promise<Avatar> {
  const a = await leerAvatar(id);
  const texto = instruccion.trim();
  if (texto.length < 3) throw new Error("Escribe qué quieres cambiar («ponle lentes», «que sonría»…).");
  const dir = dirAvatar(id);
  const corrida = path.join(dir, "_retoques", new Date().toISOString().replace(/[:.]/g, "-"));
  const ajustes = ajustesEdicion(promptRetoque(texto), [rutaRetrato(id)], semilla);
  ctx.log(`Retoque de «${a.nombre}»: ${texto}`);
  const [img] = await generarImagenes({ instalacion: instalacionWan2gp(), ajustes, dirCorrida: corrida, signal: ctx.signal, log: ctx.log, alAvanzar: ctx.alAvanzar });
  const anterior = `version-${a.versiones.length + 1}.png`;
  await fs.copyFile(rutaRetrato(id), path.join(dir, anterior));
  await guardarTomas([img!], corrida, 1);
  await fs.copyFile(path.join(corrida, "toma-1.png"), rutaRetrato(id));
  const ahora = new Date().toISOString();
  const nuevo: Avatar = {
    ...a,
    versiones: [...a.versiones, { archivo: anterior, nota: texto, fecha: ahora }],
    actualizado: ahora,
    licencia: a.licencia.includes("Qwen-Image-Edit") ? a.licencia : `${a.licencia}; retocado: ${LICENCIA_RETOQUE}`,
  };
  await escribirAvatar(nuevo);
  return nuevo;
}

/** Vuelve al retrato anterior al último retoque (el actual se descarta). */
export async function deshacerRetoque(id: string): Promise<Avatar> {
  const a = await leerAvatar(id);
  const ultima = a.versiones.at(-1);
  if (!ultima) throw new Error("Este avatar no tiene retoques para deshacer.");
  await fs.copyFile(path.join(dirAvatar(id), ultima.archivo), rutaRetrato(id));
  await fs.rm(path.join(dirAvatar(id), ultima.archivo), { force: true });
  const nuevo = { ...a, versiones: a.versiones.slice(0, -1), actualizado: new Date().toISOString() };
  await escribirAvatar(nuevo);
  return nuevo;
}

export async function renombrarAvatar(id: string, nombre: string): Promise<Avatar> {
  const a = await leerAvatar(id);
  const n = nombre.trim();
  if (!n || n.length > 60) throw new Error("El nombre debe tener entre 1 y 60 letras.");
  const nuevo = { ...a, nombre: n, actualizado: new Date().toISOString() };
  await escribirAvatar(nuevo);
  return nuevo;
}

export async function cambiarVozAvatar(id: string, voz: VozAvatar | null): Promise<Avatar> {
  const a = await leerAvatar(id);
  const nuevo: Avatar = { ...a, actualizado: new Date().toISOString() };
  if (voz) nuevo.voz = VozAvatar.parse(voz);
  else delete nuevo.voz;
  await escribirAvatar(nuevo);
  return nuevo;
}

/** Borra el avatar de la biblioteca. Los videos que ya lo usan no cambian (tienen su copia). */
export async function borrarAvatar(id: string): Promise<void> {
  await leerAvatar(id);
  await fs.rm(dirAvatar(id), { recursive: true, force: true });
}

/** Para la UI: rutas servibles por /api/archivos. */
export function vistaAvatar(a: Avatar) {
  const v = encodeURIComponent(a.actualizado);
  return {
    ...a,
    retrato: `/api/archivos/${relativaADatos(rutaRetrato(a.id))}?v=${v}`,
    estiloNombre: ESTILOS[a.estilo].nombre,
    puedeDeshacer: a.versiones.length > 0,
  };
}
