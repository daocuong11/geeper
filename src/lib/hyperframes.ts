/**
 * Cómo se ejecuta Hyperframes. En desarrollo, `npx hyperframes@<versión fijada>` (lo de siempre). En la
 * app de escritorio viene empaquetado: la carcasa pasa su CLI en GEEPER_HYPERFRAMES_CLI y se corre con el
 * Node de Electron (ELECTRON_RUN_AS_NODE ya está puesto en el servidor y el worker), apuntando al ffmpeg,
 * al Python de la voz y a una caché dentro de la carpeta de herramientas.
 */
import path from "node:path";
import { ESCRITORIO } from "./plataforma";
import { correr, type OpcionesCorrer, type Resultado } from "./proceso";
import { ESTUDIO, FFMPEG, HYPERFRAMES_VERSION, PYTHON_VOZ } from "./rutas";

const SIN_TELEMETRIA = { HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" };

/** Comando, argumentos y entorno para correr `hyperframes <args>`. */
export function comandoHf(args: string[]): { cmd: string; args: string[]; env: Record<string, string> } {
  const cli = process.env.GEEPER_HYPERFRAMES_CLI;
  if (ESCRITORIO && cli) {
    return {
      cmd: process.execPath,
      args: [cli, ...args],
      env: {
        ...SIN_TELEMETRIA,
        ELECTRON_RUN_AS_NODE: "1",
        HYPERFRAMES_FFMPEG_PATH: FFMPEG,
        FFMPEG_PATH: FFMPEG,
        HYPERFRAMES_PYTHON: PYTHON_VOZ,
        HYPERFRAMES_CACHE_DIR: path.join(ESTUDIO, "hyperframes"),
      },
    };
  }
  return { cmd: "npx", args: ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, ...args], env: SIN_TELEMETRIA };
}

/** `correr` con Hyperframes: el entorno propio se suma al que pida quien llama. */
export function correrHf(args: string[], op: OpcionesCorrer = {}): Promise<Resultado> {
  const c = comandoHf(args);
  return correr(c.cmd, c.args, { ...op, env: { ...c.env, ...op.env } });
}
