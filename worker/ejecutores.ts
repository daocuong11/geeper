/** Ejecutores por tipo de trabajo. Cada uno devuelve su resultado y, si toca, el siguiente de la cadena. */
import fs from "node:fs/promises";
import path from "node:path";
import { crearCarpetas } from "@/lib/almacen";
import { guardarPayload, type Payload, type TipoTrabajo } from "@/lib/cola";
import { db } from "@/lib/db";
import { Formato } from "@/lib/esquema";
import { tomarGpu } from "@/lib/gpu";
import { importarMpt } from "@/lib/importador";
import { Campania } from "@/lib/clips";
import { ENCUADRES, importarClip, type EncuadreClip } from "@/lib/importador-clip";
import { apiViva, crearVideo, cuerpoVideo, estadoTarea, modeloImagen } from "@/lib/mpt";
import type { Contexto } from "@/lib/pasos";
import { obtenerPlantilla } from "@/lib/plantillas";
import { correr } from "@/lib/proceso";
import { regenerarVoz } from "@/lib/regenerar";
import { renderEntregar, versionDeProyecto } from "@/lib/render";
import { publicarSubir } from "@/lib/redes/publicar";
import { dirProyecto } from "@/lib/rutas";

export interface Trabajo {
  id: string;
  tipo: string;
  proyectoId: string | null;
  payload: Payload;
}

export interface Herramientas extends Contexto {
  etapa: (e: string, progreso: number) => Promise<void>;
  signal: AbortSignal;
}

export interface Salida {
  resultado: unknown;
  siguiente?: { tipo: TipoTrabajo; payload: Payload };
}

const dormir = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok, mal) => {
    const t = setTimeout(ok, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      mal(new Error("Cancelado"));
    });
  });

function siguienteDe(payload: Payload, extra: Payload = {}): Salida["siguiente"] {
  const [tipo, ...resto] = payload.cadena ?? [];
  if (!tipo) return undefined;
  return { tipo, payload: { ...extra, cadena: resto } };
}

/** Telemetría de la GPU cada 5 s en un CSV que sobrevive a un reinicio (fsync en cada línea). */
function telemetria(ruta: string): () => void {
  let activo = true;
  const tick = async () => {
    if (!activo) return;
    try {
      const r = await correr("nvidia-smi", ["--query-gpu=temperature.gpu,power.draw,memory.used,utilization.gpu", "--format=csv,noheader,nounits"], { permitirFallo: true });
      const carga = (await fs.readFile("/proc/loadavg", "utf8")).split(" ")[0];
      const fh = await fs.open(ruta, "a");
      await fh.write(`${new Date().toISOString()},${r.stdout.trim().replace(/\s/g, "")},${carga}\n`);
      await fh.sync();
      await fh.close();
    } catch {
      /* sin nvidia-smi */
    }
    if (activo) setTimeout(() => void tick(), 5000).unref();
  };
  void fs.writeFile(ruta, "tiempo,temp_c,potencia_w,vram_mib,uso_pct,carga1\n").then(tick);
  return () => {
    activo = false;
  };
}

async function mptGenerar(t: Trabajo, h: Herramientas): Promise<Salida> {
  const proyecto = await db.proyecto.findUniqueOrThrow({ where: { id: t.proyectoId! } });
  const dir = await crearCarpetas(proyecto.slug);
  const plantilla = await obtenerPlantilla(proyecto.plantilla);
  if (!(await apiViva())) throw new Error("La API de MPT (127.0.0.1:8080) no responde. Corre `pnpm run doctor` para ver qué falta.");
  await db.proyecto.update({ where: { id: proyecto.id }, data: { estado: "generando" } });

  let taskId = typeof t.payload.mptTaskId === "string" ? t.payload.mptTaskId : undefined;
  if (taskId) {
    const e = await estadoTarea(taskId);
    if (e.estado === "completa") {
      h.log(`La tarea MPT ${taskId} ya había terminado: no se vuelve a generar`);
      return { resultado: { taskId, retomada: true }, siguiente: siguienteDe(t.payload, { taskId }) };
    }
    if (e.estado === "fallida" || e.estado === "perdida") {
      h.log(`La tarea MPT anterior ${taskId} quedó ${e.estado}: se pide una nueva`);
      taskId = undefined;
    } else h.log(`Retomo la espera de la tarea MPT ${taskId} (${e.progreso} %)`);
  }

  await h.etapa("Esperando la GPU", 0.01);
  const candado = await tomarGpu(`mpt ${proyecto.slug}`, {
    esperar: true,
    signal: h.signal,
    alEsperar: (quien) => {
      h.log(`GPU ocupada por: ${quien}. Esperando...`);
      void h.etapa(`Esperando la GPU (la tiene: ${quien.slice(0, 80)})`, 0.01);
    },
  });
  const pararTelemetria = telemetria(path.join(dir, "logs", `${t.id}-telemetria.csv`));
  try {
    if (!taskId) {
      const cuerpo = cuerpoVideo(proyecto.tema, Formato.parse(proyecto.formato), plantilla.datos.mpt);
      taskId = await crearVideo(cuerpo);
      // Se guarda ANTES de esperar: si el worker muere, al relanzar se retoma esta misma tarea.
      await guardarPayload(t.id, { ...t.payload, mptTaskId: taskId });
      h.log(`MPT aceptó la tarea ${taskId}: ${JSON.stringify(cuerpo)}`);
    }
    const t0 = Date.now();
    for (;;) {
      const e = await estadoTarea(taskId);
      if (e.estado === "completa") break;
      if (e.estado === "fallida" || e.estado === "perdida") throw new Error(`MPT: tarea ${taskId} ${e.estado}. ${e.detalle ?? ""}`);
      await h.etapa(`MPT generando (${e.progreso} %, ${Math.round((Date.now() - t0) / 1000)} s)`, 0.02 + (e.progreso / 100) * 0.95);
      await dormir(5000, h.signal);
    }
    h.log(`MPT terminó la tarea ${taskId} en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } finally {
    pararTelemetria();
    candado?.liberar();
  }
  return { resultado: { taskId }, siguiente: siguienteDe(t.payload, { taskId }) };
}

async function proyectoImportar(t: Trabajo, h: Herramientas): Promise<Salida> {
  const proyecto = await db.proyecto.findUniqueOrThrow({ where: { id: t.proyectoId! } });
  const taskId = String(t.payload.taskId ?? "");
  const plantilla = await obtenerPlantilla(proyecto.plantilla);
  await h.etapa("Copiando la tarea de MPT y alineando la voz (whisper, CPU)", 0.1);
  const r = await importarMpt(h, {
    proyectoId: proyecto.id,
    slug: proyecto.slug,
    nombre: proyecto.nombre,
    tema: proyecto.tema,
    formato: Formato.parse(proyecto.formato),
    plantilla,
    taskId,
    modeloImagen: await modeloImagen(),
  });
  await db.proyecto.update({ where: { id: proyecto.id }, data: { estado: "ensamblado" } });
  return { resultado: r, siguiente: siguienteDe(t.payload, { version: r.version }) };
}

async function clipImportar(t: Trabajo, h: Herramientas): Promise<Salida> {
  const proyecto = await db.proyecto.findUniqueOrThrow({ where: { id: t.proyectoId! } });
  const pl = t.payload;
  const encuadre = String(pl.encuadre ?? "cubrir");
  if (!(ENCUADRES as readonly string[]).includes(encuadre)) throw new Error(`Encuadre desconocido: ${encuadre}`);
  const texto = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
  await h.etapa("Cortando el tramo, reencuadrando y transcribiendo (CPU)", 0.1);
  const r = await importarClip(h, {
    proyectoId: proyecto.id,
    slug: proyecto.slug,
    nombre: proyecto.nombre,
    tema: proyecto.tema,
    formato: Formato.parse(proyecto.formato),
    plantilla: await obtenerPlantilla(proyecto.plantilla),
    fuenteId: String(pl.fuenteId ?? ""),
    inicio: Number(pl.inicio),
    fin: Number(pl.fin),
    encuadre: encuadre as EncuadreClip,
    idioma: texto(pl.idioma) ?? "es",
    titulo: texto(pl.titulo),
    gancho: texto(pl.gancho),
    permiso: texto(pl.permiso),
    campania: pl.campania ? Campania.parse(pl.campania) : undefined,
  });
  await db.proyecto.update({ where: { id: proyecto.id }, data: { estado: "ensamblado" } });
  return { resultado: r, siguiente: siguienteDe(t.payload, { version: r.version }) };
}

async function vozRegenerar(t: Trabajo, h: Herramientas): Promise<Salida> {
  const escena = typeof t.payload.escena === "string" ? t.payload.escena : null;
  await h.etapa(escena ? `Voz nueva para ${escena} (Kokoro + whisper, CPU)` : "Voz nueva del guion completo (Kokoro + whisper, CPU)", 0.1);
  const { p } = await versionDeProyecto(t.proyectoId!);
  const r = await regenerarVoz(h, t.proyectoId!, p, escena);
  return { resultado: r, siguiente: siguienteDe(t.payload, { version: r.version }) };
}

async function renderEntregarEj(t: Trabajo, h: Herramientas): Promise<Salida> {
  const version = typeof t.payload.version === "number" ? t.payload.version : undefined;
  const r = await renderEntregar(h, t.proyectoId!, t.id, version);
  if (!r.aprobado) h.log("El render no pasó el QC: revisa el informe en el proyecto.");
  return { resultado: r };
}

async function publicarSubirEj(t: Trabajo, h: Herramientas): Promise<Salida> {
  const resultado = await publicarSubir(t.id, t.payload, {
    log: h.log,
    etapa: h.etapa,
    signal: h.signal,
    guardar: async (payload) => {
      t.payload = payload;
      await guardarPayload(t.id, payload);
    },
  });
  return { resultado };
}

export const EJECUTORES: Record<TipoTrabajo, (t: Trabajo, h: Herramientas) => Promise<Salida>> = {
  "mpt.generar": mptGenerar,
  "proyecto.importar": proyectoImportar,
  "clip.importar": clipImportar,
  "voz.regenerar": vozRegenerar,
  "render.entregar": renderEntregarEj,
  "publicar.subir": publicarSubirEj,
};

export async function rutaLog(t: Trabajo): Promise<{ abs: string; rel: string }> {
  if (t.proyectoId) {
    const p = await db.proyecto.findUniqueOrThrow({ where: { id: t.proyectoId } });
    const dir = path.join(dirProyecto(p.slug), "logs");
    await fs.mkdir(dir, { recursive: true });
    return { abs: path.join(dir, `${t.id}.log`), rel: path.join(p.slug, "logs", `${t.id}.log`) };
  }
  const dir = path.join(dirProyecto("sistema"), "logs");
  await fs.mkdir(dir, { recursive: true });
  return { abs: path.join(dir, `${t.id}.log`), rel: path.join("sistema", "logs", `${t.id}.log`) };
}
