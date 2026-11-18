/** Cliente de la API HTTP de MoneyPrinterTurbo (127.0.0.1:8080). */
import { correr } from "./proceso";
import { MPT_API, MPT_CONTENEDOR, MPT_TAREAS } from "./rutas";
import type { DatosPlantilla } from "./plantillas";
import type { Formato } from "./esquema";

export interface EstadoMpt {
  estado: "procesando" | "completa" | "fallida" | "perdida";
  progreso: number;
  detalle?: string;
}

async function pedir(ruta: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  const r = await fetch(`${MPT_API}/api/v1${ruta}`, { ...init, signal: AbortSignal.timeout(30_000) });
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    /* sin cuerpo */
  }
  return { status: r.status, json };
}

export function cuerpoVideo(tema: string, formato: Formato, mpt: DatosPlantilla["mpt"]) {
  return {
    video_subject: tema,
    video_language: mpt.video_language,
    voice_name: mpt.voice_name,
    voice_rate: mpt.voice_rate,
    video_source: mpt.video_source,
    video_aspect: formato,
    video_clip_duration: mpt.video_clip_duration,
    video_count: 1,
    paragraph_number: mpt.paragraph_number,
    video_script_prompt: mpt.video_script_prompt,
    // La música la mezcla Geeper (sabe cuál es y su licencia); los subtítulos, también.
    bgm_type: "",
    subtitle_enabled: false,
    n_threads: 2,
  };
}

export async function crearVideo(cuerpo: ReturnType<typeof cuerpoVideo>): Promise<string> {
  const r = await pedir("/videos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
  const id = (r.json as { data?: { task_id?: string } } | null)?.data?.task_id;
  if (r.status !== 200 || !id) throw new Error(`MPT rechazó el pedido (${r.status}): ${JSON.stringify(r.json).slice(0, 500)}`);
  return id;
}

async function tieneFinal(taskId: string): Promise<boolean> {
  const r = await correr("docker", ["exec", MPT_CONTENEDOR, "test", "-f", `${MPT_TAREAS}/${taskId}/final-1.mp4`], { permitirFallo: true });
  return r.codigo === 0;
}

export async function estadoTarea(taskId: string): Promise<EstadoMpt> {
  const r = await pedir(`/tasks/${taskId}`);
  if (r.status === 404) {
    // La API de MPT guarda el estado en memoria: si se reinició, mira si el video quedó en disco.
    return (await tieneFinal(taskId)) ? { estado: "completa", progreso: 100 } : { estado: "perdida", progreso: 0, detalle: "MPT no conoce la tarea" };
  }
  const d = (r.json as { data?: { state?: number; progress?: number; videos?: string[] } } | null)?.data ?? {};
  const progreso = Number(d.progress ?? 0);
  if (d.state === 1) return { estado: "completa", progreso: 100 };
  if (d.state === -1) return { estado: "fallida", progreso, detalle: JSON.stringify(d).slice(0, 800) };
  return { estado: "procesando", progreso };
}

export async function apiViva(): Promise<boolean> {
  try {
    const r = await fetch(`${MPT_API}/api/v1/tasks?page=1&page_size=1`, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function modeloImagen(): Promise<string | undefined> {
  const r = await correr("docker", ["exec", "mpt-image-server", "printenv", "IMAGE_MODEL"], { permitirFallo: true });
  const v = r.stdout.trim();
  return v ? v.split("/").pop() : undefined;
}
