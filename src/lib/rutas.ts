import os from "node:os";
import path from "node:path";

/** Carpeta de datos de Geeper (fuera del repo). Se puede cambiar con GEEPER_DATA. */
export function dirDatos(): string {
  return process.env.GEEPER_DATA ?? path.join(os.homedir(), "geeper-data");
}

export function rutaBaseDatos(): string {
  return process.env.GEEPER_DB ?? path.join(dirDatos(), "geeper.db");
}

export function dirProyecto(slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) throw new Error(`Slug de proyecto inválido: ${slug}`);
  return path.join(dirDatos(), slug);
}

export const ESTUDIO = path.join(os.homedir(), "dev", "video-tools");
export const MPT_DIR = path.join(os.homedir(), "dev", "MoneyPrinterTurbo");
export const GPU_LOCK_BIN = path.join(ESTUDIO, "bin", "gpu-lock");
export const GPU_LOCK_FILE = process.env.GPU_LOCK ?? path.join(ESTUDIO, ".gpu.lock");
export const MPT_ACABADO_PY = path.join(ESTUDIO, "bin", "mpt_acabado.py");
export const FFMPEG = process.env.GEEPER_FFMPEG ?? path.join(os.homedir(), ".local", "bin", "ffmpeg");
export const FFPROBE = process.env.GEEPER_FFPROBE ?? path.join(os.homedir(), ".local", "bin", "ffprobe");
export const MPT_API = process.env.GEEPER_MPT_API ?? "http://127.0.0.1:8080";
export const MPT_CONTENEDOR = "moneyprinterturbo-api";
export const MPT_TAREAS = "/MoneyPrinterTurbo/storage/tasks";
export const HYPERFRAMES_VERSION = "0.9.27";
/** Raíz del repo (para localizar py/ y otros recursos). */
export const RAIZ_REPO = process.env.GEEPER_REPO ?? process.cwd();
/** Python con kokoro-onnx para `hyperframes tts` (el venv del estudio). */
export const PYTHON_VOZ = process.env.HYPERFRAMES_PYTHON ?? path.join(ESTUDIO, "OpenMontage", ".venv", "bin", "python");
