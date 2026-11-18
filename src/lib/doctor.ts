/** Diagnóstico de solo lectura: verifica lo que Geeper necesita y dice cómo arreglar lo que falle. */
import fs from "node:fs/promises";
import { correr } from "./proceso";
import { apiViva } from "./mpt";
import { ESTUDIO, FFMPEG, GPU_LOCK_BIN, GPU_LOCK_FILE, HYPERFRAMES_VERSION, MPT_API, PYTHON_VOZ, dirDatos } from "./rutas";
import { existe } from "./archivos";

export interface Chequeo {
  nombre: string;
  ok: boolean;
  /** Aviso: no impide trabajar. */
  aviso?: boolean;
  detalle: string;
  arreglo?: string;
}

const CONTENEDORES_MPT = ["moneyprinterturbo-api", "moneyprinterturbo-webui", "mpt-ollama", "mpt-kokoro", "mpt-image-server"];

async function intento(cmd: string, args: string[], timeout = 20_000) {
  try {
    return await correr(cmd, args, { permitirFallo: true, timeout });
  } catch (e) {
    return { codigo: -1, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
  }
}

export async function diagnosticar(): Promise<Chequeo[]> {
  const c: Chequeo[] = [];

  // Docker.
  const docker = await intento("docker", ["ps", "--format", "{{.Names}}\t{{.State}}\t{{.Status}}"]);
  if (docker.codigo !== 0) {
    const npipe = /dockerDesktopLinuxEngine|npipe/.test(docker.stderr);
    c.push({
      nombre: "Docker", ok: false, detalle: docker.stderr.trim().split("\n")[0] ?? "docker no responde",
      arreglo: npipe ? "Abre Docker Desktop en Windows y espera a que diga «Engine running»." : "Verifica que Docker Desktop esté instalado y con la integración WSL activa.",
    });
  } else {
    c.push({ nombre: "Docker", ok: true, detalle: "responde" });
    const filas = new Map(docker.stdout.trim().split("\n").filter(Boolean).map((l) => {
      const [n, estado, status] = l.split("\t");
      return [n!, { estado, status }];
    }));
    for (const n of CONTENEDORES_MPT) {
      const f = filas.get(n);
      c.push({
        nombre: `Contenedor ${n}`, ok: f?.estado === "running", detalle: f ? `${f.estado} (${f.status})` : "no existe o está detenido",
        arreglo: f?.estado === "running" ? undefined : "cd ~/dev/MoneyPrinterTurbo && docker compose up -d   (nunca `down -v` ni `prune`)",
      });
    }
    const farol = [...filas.keys()].filter((n) => n.startsWith("supabase_") || n === "farol-dev-redis");
    c.push({ nombre: "Contenedores de Farol", ok: true, aviso: true, detalle: `${farol.length} corriendo; Geeper no los toca` });
  }

  // API de MPT.
  const api = await apiViva();
  c.push({
    nombre: `API de MPT (${MPT_API})`, ok: api, detalle: api ? "responde" : "no responde",
    arreglo: api ? undefined : "docker restart moneyprinterturbo-api   y revisa `docker logs --tail 50 moneyprinterturbo-api`",
  });

  // Hyperframes.
  const hf = await intento("npx", ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, "--version"], 120_000);
  const vhf = hf.stdout.trim().split("\n").pop() ?? "";
  c.push({
    nombre: `Hyperframes ${HYPERFRAMES_VERSION}`, ok: hf.codigo === 0 && vhf.includes(HYPERFRAMES_VERSION), detalle: vhf || hf.stderr.slice(0, 200),
    arreglo: hf.codigo === 0 ? undefined : `npx --yes hyperframes@${HYPERFRAMES_VERSION} browser ensure   (necesita internet la primera vez)`,
  });
  const whisper = await existe(`${process.env.HOME}/.cache/hyperframes/whisper/models/ggml-medium.bin`);
  c.push({
    nombre: "whisper medium (Hyperframes)", ok: whisper, detalle: whisper ? "modelo en caché" : "falta el modelo",
    arreglo: whisper ? undefined : "Se descarga solo en el primer `hyperframes transcribe --model medium` (~1,5 GB).",
  });

  // ffmpeg con NVENC.
  const ff = await intento(FFMPEG, ["-hide_banner", "-encoders"]);
  const nvenc = /h264_nvenc/.test(ff.stdout);
  c.push({
    nombre: `ffmpeg (${FFMPEG})`, ok: ff.codigo === 0 && nvenc, detalle: ff.codigo !== 0 ? "no se pudo ejecutar" : nvenc ? "con h264_nvenc" : "sin h264_nvenc",
    arreglo: ff.codigo === 0 && nvenc ? undefined : "Ver «Instalación» en ~/dev/video-tools/ESTUDIO.md (ffmpeg de Ubuntu extraído en ~/.local).",
  });

  // venv del estudio.
  const venv = PYTHON_VOZ;
  const py = await intento(venv, ["-c", "import torch, kokoro_onnx; print(torch.__version__, torch.cuda.is_available())"], 60_000);
  c.push({
    nombre: "venv del estudio (Kokoro para regenerar voz)", ok: py.codigo === 0,
    detalle: py.codigo === 0 ? `kokoro-onnx ok, torch ${py.stdout.trim()}` : "no responde: regenerar la voz no funcionará",
    arreglo: py.codigo === 0 ? undefined : "source ~/dev/video-tools/estudio.sh  (ver ESTUDIO.md)",
  });

  // GPU y VRAM.
  const smi = await intento("nvidia-smi", ["--query-gpu=name,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits"]);
  if (smi.codigo === 0) {
    const [nombre, usada, total, temp] = smi.stdout.trim().split(",").map((s) => s.trim());
    const libre = Number(total) - Number(usada);
    c.push({
      nombre: "GPU", ok: true, aviso: libre < 6000, detalle: `${nombre}: ${libre} MiB libres de ${total} (${temp} °C)`,
      arreglo: libre < 6000 ? "Poca VRAM libre: cierra apps con aceleración por hardware en Windows (ver ESTUDIO.md)." : undefined,
    });
  } else c.push({ nombre: "GPU", ok: false, detalle: "nvidia-smi no responde", arreglo: "Revisa el driver de NVIDIA en Windows (WSL usa el de Windows)." });

  // gpu-lock.
  const bin = await existe(GPU_LOCK_BIN);
  let dueno = "";
  try {
    dueno = (await fs.readFile(`${GPU_LOCK_FILE}.owner`, "utf8")).trim();
  } catch {
    /* libre */
  }
  c.push({
    nombre: "gpu-lock", ok: bin, detalle: !bin ? `falta ${GPU_LOCK_BIN}` : dueno ? `ocupado: ${dueno}` : "libre",
    arreglo: bin ? undefined : "Restaura ~/dev/video-tools/bin/gpu-lock (ver ESTUDIO.md).",
  });

  // Datos.
  const datos = dirDatos();
  try {
    await fs.access(datos, fs.constants.W_OK);
    c.push({ nombre: "Carpeta de datos", ok: true, detalle: datos });
  } catch {
    c.push({ nombre: "Carpeta de datos", ok: false, detalle: `${datos} no existe o no se puede escribir`, arreglo: `mkdir -p ${datos} && pnpm run setup` });
  }
  const py3 = await intento("python3", ["-c", "import sys; sys.path.insert(0, '" + ESTUDIO + "/bin'); import mpt_acabado; print('ok')"]);
  c.push({
    nombre: "mpt_acabado.py (alineación)", ok: py3.stdout.includes("ok"), detalle: py3.stdout.includes("ok") ? "se importa" : py3.stderr.slice(0, 200),
    arreglo: py3.stdout.includes("ok") ? undefined : "Restaura ~/dev/video-tools/bin/mpt_acabado.py",
  });
  return c;
}
