/**
 * «Tu avatar en el video» como protagonista: un solo set, de corrido (decisión del dueño, 2026-11-22).
 *
 * Como un creador real frente a su cámara: el mismo lugar y la misma luz todo el video, y el avatar habla
 * y gesticula de principio a fin. Sale la mitad de rápido que escena por escena (cada toma de InfiniteTalk
 * tiene ~7 min fijos de carga) y la cara no cambia entre escenas.
 *
 * 1. La voz del video pasa a ser la del avatar (si tiene una elegida y el video habla con otra).
 * 2. Una imagen del avatar en el set (con el producto en la mano, si hay), una sola vez.
 * 3. Tomas de corrido de hasta `MAX_SEGUNDOS` (las escenas seguidas que entran), todas desde esa imagen y
 *    con la misma semilla: el avatar reemplaza las imágenes de esas escenas.
 * 4. Las imágenes del tema siguen en el video, en una ventana encima (menos en el gancho: ahí, su cara).
 *
 * Una toma que falla deja esas escenas como estaban (se reintentan desde el editor) y no tumba el video.
 */
import path from "node:path";
import { guardarProyecto, registrarAssetsEnDb } from "./almacen";
import { componerCuadro, PedidoActuar, promptHabla, type CuerpoAvatar } from "./actuar";
import { leerAvatar, type VozAvatar } from "./avatares";
import { aplicarEdicion } from "./ediciones";
import { Marco, validarProyecto, type Clip, type Proyecto } from "./esquema";
import { ENTRADA, escenasEnLinea } from "./linea";
import { generarPresentador, MAX_SEGUNDOS, MODELO_HABLAR, type ContextoPresentador } from "./presentador";
import { regenerarVoz } from "./regenerar";
import { versionDeProyecto } from "./render";
import { segundosHablar } from "./tiempo-hablar";

/** El set: el cuarto de un creador real, no un estudio de IA (luz de ventana, fondo desenfocado). */
export const SET_PROTAGONISTA =
  "a real, lived-in home studio of a content creator, a bookshelf and a plant softly out of focus behind, " +
  "soft natural window light from one side, warm true-to-life colors, shot on a real camera";

/** Pista con las imágenes del tema encima del protagonista. */
export const PISTA_RECORTES = "recortes";
/** Ventana de las imágenes: redondeada, en la esquina que menos tapa la cara (marco-auto.ts). */
export const MARCO_RECORTES = Marco.parse({ forma: "redondeado", esquina: "auto", tamano: 0.4 });

/**
 * Tomas de corrido (función pura): escenas seguidas cuya voz, con la entrada, entra en una toma del
 * presentador en pantalla (`MAX_SEGUNDOS`). Un short de un minuto es una sola toma.
 */
export function tomasProtagonista(p: Proyecto): string[][] {
  const tomas: string[][] = [];
  let actual: string[] = [];
  let segundos = ENTRADA;
  for (const e of escenasEnLinea(p)) {
    const d = e.voz.rango.duracion;
    if (ENTRADA + d > MAX_SEGUNDOS) throw new Error(`La escena ${e.indice + 1} tiene más de ${Math.floor(MAX_SEGUNDOS - ENTRADA)} s de voz y no entra en una toma: pártela en el editor y vuelve a intentarlo.`);
    if (actual.length && segundos + d > MAX_SEGUNDOS) {
      tomas.push(actual);
      actual = [];
      segundos = ENTRADA;
    }
    actual.push(e.escena.id);
    segundos += d;
  }
  if (actual.length) tomas.push(actual);
  return tomas;
}

/** Segundos de voz de cada toma (para decir cuánto tarda). Función pura. */
export function segundosDeTomas(p: Proyecto): number[] {
  const dur = new Map(escenasEnLinea(p).map((e) => [e.escena.id, e.voz.rango.duracion]));
  return tomasProtagonista(p).map((t) => ENTRADA + t.reduce((s, id) => s + (dur.get(id) ?? 0), 0));
}

/**
 * Minutos estimados en la RTX 5080: las dos imágenes (de cuerpo y en el set, ~2) y cada toma
 * (tiempo-hablar.ts). Medio cuerpo y cuerpo completo tardan lo mismo: los dos van a 480p. Función pura.
 */
export function minutosProtagonista(segundos: number[]): number {
  return Math.ceil(2 + segundos.reduce((m, s) => m + segundosHablar(s) / 60, 0));
}

/** ¿El video ya habla con la voz del avatar? (MPT antepone «kokoro:»). */
export function hablaConSuVoz(voz: Proyecto["voz"], v: VozAvatar): boolean {
  return v.motor === "voxcpm" ? voz.motor === "voxcpm" && voz.voz === v.voz : voz.motor !== "voxcpm" && voz.voz.split(":").pop() === v.voz;
}

/**
 * Las imágenes del tema en una ventana encima del protagonista (función pura): en cada escena que ya es el
 * avatar, menos la primera (el gancho es su cara), la imagen que tenía antes, con su movimiento. Si el avatar
 * ya era protagonista (se pone otra vez), la imagen es la que ya estaba en la ventana, no el avatar viejo.
 */
export function conRecortes(p: Proyecto, original: Proyecto): Proyecto {
  const n = structuredClone(p);
  const antes = new Map(escenasEnLinea(original).map((e) => [e.escena.id, e]));
  const enVentana = new Map((original.pistas.find((x) => x.id === PISTA_RECORTES)?.clips ?? []).map((c) => [c.escena ?? c.id.replace(/^recorte-/, ""), c]));
  const clips: Clip[] = [];
  for (const e of escenasEnLinea(n).slice(1)) {
    const o = antes.get(e.escena.id);
    if (!o || o.visual.asset === e.visual.asset) continue;
    const previo = enVentana.get(e.escena.id);
    const fuente = previo ?? (original.assets[o.visual.asset]?.regenerar.motor === MODELO_HABLAR ? null : o.visual);
    const a = fuente && original.assets[fuente.asset];
    if (!fuente || !a || a.tipo === "audio") continue;
    n.assets[a.id] ??= a;
    const duracion = a.tipo === "video" && a.duracion ? Math.min(e.duracion, Math.max(0.1, a.duracion - fuente.rango.inicio)) : e.duracion;
    const c: Clip = { id: `recorte-${e.escena.id}`, asset: a.id, rango: { inicio: fuente.rango.inicio, duracion }, inicio: e.inicio, marco: MARCO_RECORTES, transicion: { tipo: "fundido", duracion: 0.3 } };
    if (fuente.movimiento) c.movimiento = fuente.movimiento;
    clips.push(c);
  }
  n.pistas = n.pistas.filter((x) => x.id !== PISTA_RECORTES);
  if (clips.length) n.pistas.push({ id: PISTA_RECORTES, tipo: "video", clips });
  return validarProyecto(n);
}

export interface PedidoProtagonista {
  avatar: string;
  cuerpo: CuerpoAvatar;
  producto?: string;
  semilla?: number;
}

export interface AvanceProtagonista {
  etapa: string;
  avance: number;
}

/** Pone al avatar de protagonista en todo el video. Devuelve las escenas que quedaron con él. */
export async function protagonizarVideo(
  ctx: ContextoPresentador,
  proyectoId: string,
  o: PedidoProtagonista,
  etapa: (a: AvanceProtagonista) => void | Promise<void>,
): Promise<{ escenas: number[]; tomas: number }> {
  const avatar = await leerAvatar(o.avatar);
  let { p } = await versionDeProyecto(proyectoId);

  // 1. Su voz. Antes de las tomas: la boca sigue a la voz que va a quedar.
  if (avatar.voz && !hablaConSuVoz(p.voz, avatar.voz)) {
    await etapa({ etapa: `Poniendo la voz de ${avatar.nombre} («${avatar.voz.nombre}») en todo el video`, avance: 0.02 });
    const conVoz = aplicarEdicion(p, { tipo: "cambiarVoz", motor: avatar.voz.motor, voz: avatar.voz.voz });
    try {
      await regenerarVoz(ctx, proyectoId, conVoz, null);
      ({ p } = await versionDeProyecto(proyectoId));
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      ctx.log(`No se pudo poner la voz de ${avatar.nombre} (${e instanceof Error ? e.message.split("\n")[0] : e}); sigue con la del video.`);
    }
  }
  const original = p;
  const tomas = tomasProtagonista(p);

  // 2. El avatar en el set, una vez para todas las tomas.
  await etapa({ etapa: `Preparando a ${avatar.nombre} en su set`, avance: 0.05 });
  const pedido = PedidoActuar.parse({ avatar: o.avatar, tipo: "habla", encuadre: o.cuerpo, que: "", lugar: "describir", donde: SET_PROTAGONISTA, producto: o.producto, semilla: o.semilla });
  const corrida = path.join(ctx.dir, "build", "protagonista", new Date().toISOString().replace(/[:.]/g, "-"));
  let cuadro: string;
  try {
    cuadro = await componerCuadro(ctx, p, escenasEnLinea(p)[0]!.escena.id, pedido, corrida);
  } catch (e) {
    // Sin la imagen no hay tomas: el video sigue con las imágenes (se reintenta desde el editor).
    if (ctx.signal?.aborted) throw e;
    ctx.log(`No se pudo preparar a ${avatar.nombre} en su set (${e instanceof Error ? e.message.split("\n")[0] : e}); el video queda con las imágenes.`);
    return { escenas: [], tomas: tomas.length };
  }

  // 3. Las tomas, con la misma semilla: el mismo modo de moverse en todo el video.
  const semilla = o.semilla ?? Math.floor(Math.random() * 2 ** 31);
  const numero = new Map(escenasEnLinea(p).map((e) => [e.escena.id, e.indice + 1]));
  const hechas: number[] = [];
  for (const [i, escenas] of tomas.entries()) {
    const nums = escenas.map((id) => numero.get(id)!);
    const de = tomas.length > 1 ? ` (toma ${i + 1} de ${tomas.length}: escenas ${nums[0]}–${nums.at(-1)})` : "";
    await etapa({ etapa: `${avatar.nombre} hablando a cámara${de}`, avance: 0.1 + (0.85 * i) / tomas.length });
    try {
      await generarPresentador(ctx, proyectoId, p, {
        avatar: o.avatar,
        modo: "pantalla",
        escenas,
        imagen: cuadro,
        prompt: promptHabla(o.cuerpo),
        // 480p siempre (tiempo-hablar.ts): a 720p tarda ~5 veces más con el mismo modelo de 480p.
        semilla,
      });
      hechas.push(...nums);
      ({ p } = await versionDeProyecto(proyectoId));
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      ctx.log(`Escenas ${nums.join(", ")}: no se pudo (${e instanceof Error ? e.message.split("\n")[0] : e}); quedan como estaban.`);
    }
  }

  // 4. Las imágenes del tema, en una ventana encima.
  if (hechas.length) {
    await etapa({ etapa: "Poniendo las imágenes del tema en una ventana", avance: 0.97 });
    const final = conRecortes(p, original);
    await guardarProyecto(proyectoId, final, `${avatar.nombre} protagoniza el video; las imágenes del tema, en una ventana`);
    await registrarAssetsEnDb(proyectoId, final);
  }
  return { escenas: hechas, tomas: tomas.length };
}
