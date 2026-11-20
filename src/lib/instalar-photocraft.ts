/**
 * Instala PhotoCraft con un clic (docs/PHOTOCRAFT.md §3): baja el tarball oficial de Linux de la versión
 * fijada, verifica su SHA256 contra SHA256SUMS.txt de la misma release, lo descomprime en
 * ~/dev/video-tools/photocraft/<versión> y apunta `actual` ahí. Corre dentro del servidor web (una sola
 * instalación a la vez); el estado se consulta con `estadoInstalacion()`.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { versionPhotocraft } from "./photocraft";
import { correr } from "./proceso";
import { ESTUDIO, PHOTOCRAFT_VERSION } from "./rutas";

export interface EstadoInstalacion {
  fase: "inactiva" | "descargando" | "verificando" | "descomprimiendo" | "lista" | "error";
  progreso: number;
  detalle: string;
}

const BASE = `https://github.com/storytold/photocraft/releases/download/v${PHOTOCRAFT_VERSION}`;
const TARBALL = `photocraft-${PHOTOCRAFT_VERSION}-linux-x86_64.tar.gz`;
const DIR = path.join(ESTUDIO, "photocraft");

let estado: EstadoInstalacion = { fase: "inactiva", progreso: 0, detalle: "" };
let enCurso: Promise<void> | null = null;

export function estadoInstalacion(): EstadoInstalacion {
  return estado;
}

/** Suma esperada para el tarball, leída de SHA256SUMS.txt (función pura). */
export function sumaEsperada(sumas: string, archivo: string): string | null {
  for (const linea of sumas.split("\n")) {
    const m = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(linea.trim());
    if (m && m[2]!.trim() === archivo) return m[1]!.toLowerCase();
  }
  return null;
}

async function instalar(): Promise<void> {
  if (process.platform !== "linux" || process.arch !== "x64") throw new Error("La instalación automática es para Linux x86_64 (WSL). Instálala a mano: docs/PHOTOCRAFT.md §3.");
  const destino = path.join(DIR, PHOTOCRAFT_VERSION);
  await fs.mkdir(DIR, { recursive: true });
  const tmp = await fs.mkdtemp(path.join(DIR, ".instalando-"));
  try {
    estado = { fase: "descargando", progreso: 0, detalle: "Buscando la versión verificada…" };
    const rs = await fetch(`${BASE}/SHA256SUMS.txt`);
    if (!rs.ok) throw new Error(`GitHub respondió ${rs.status} al pedir las sumas de verificación`);
    const esperada = sumaEsperada(await rs.text(), TARBALL);
    if (!esperada) throw new Error("La release no publica la suma del archivo de Linux");

    const r = await fetch(`${BASE}/${TARBALL}`);
    if (!r.ok || !r.body) throw new Error(`GitHub respondió ${r.status} al descargar`);
    const total = Number(r.headers.get("content-length")) || 0;
    const hash = createHash("sha256");
    let bajado = 0;
    const archivo = path.join(tmp, TARBALL);
    const cuerpo = Readable.fromWeb(r.body as import("node:stream/web").ReadableStream<Uint8Array>);
    cuerpo.on("data", (d: Buffer) => {
      hash.update(d);
      bajado += d.length;
      const mb = (n: number) => Math.round(n / 1e6);
      estado = { fase: "descargando", progreso: total ? bajado / total : 0, detalle: `Descargando ${mb(bajado)}${total ? ` de ${mb(total)}` : ""} MB…` };
    });
    await pipeline(cuerpo, createWriteStream(archivo));

    estado = { fase: "verificando", progreso: 1, detalle: "Verificando que el archivo sea el oficial…" };
    if (hash.digest("hex") !== esperada) throw new Error("El archivo descargado no coincide con la suma oficial: no se instaló (puede ser un problema de red; prueba de nuevo)");

    estado = { fase: "descomprimiendo", progreso: 1, detalle: "Descomprimiendo…" };
    const extraido = path.join(tmp, "x");
    await fs.mkdir(extraido);
    await correr("tar", ["-xzf", archivo, "-C", extraido], { timeout: 300_000 });
    await fs.rm(destino, { recursive: true, force: true });
    await fs.rename(extraido, destino);
    const carpeta = path.join(destino, `photocraft-${PHOTOCRAFT_VERSION}-linux-x86_64`);
    const enlaceTmp = path.join(DIR, `.actual-${process.pid}`);
    await fs.rm(enlaceTmp, { force: true });
    await fs.symlink(carpeta, enlaceTmp);
    await fs.rename(enlaceTmp, path.join(DIR, "actual"));

    const v = await versionPhotocraft();
    if (!v?.includes(PHOTOCRAFT_VERSION)) throw new Error("Se instaló pero no arranca. Revisa docs/PHOTOCRAFT.md §3.");
    estado = { fase: "lista", progreso: 1, detalle: `Instalada: ${v}` };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/** Arranca la instalación (si no hay otra en curso) y vuelve enseguida. */
export function iniciarInstalacion(): EstadoInstalacion {
  if (!enCurso) {
    estado = { fase: "descargando", progreso: 0, detalle: "Empezando…" };
    enCurso = instalar()
      .catch((e: unknown) => {
        estado = { fase: "error", progreso: 0, detalle: e instanceof Error ? e.message : String(e) };
      })
      .finally(() => {
        enCurso = null;
      });
  }
  return estado;
}
