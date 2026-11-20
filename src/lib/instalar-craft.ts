/**
 * Instalador con un clic de una app Craft de storytold (el mismo procedimiento que
 * `instalar-photocraft.ts`, con la app como parámetro): baja el tarball oficial de Linux de la versión
 * fijada, verifica su SHA256 contra SHA256SUMS.txt de la misma release, lo descomprime en
 * ~/dev/video-tools/<app>/<versión> y apunta `actual` ahí. Una instalación a la vez por app.
 * Con `archivo`, `carpeta` y `extraer: "zip"` instala otro archivo de la release (p. ej. la versión
 * web, ver craft-web.ts) en ~/dev/video-tools/<carpeta>/<versión>.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { sumaEsperada, type EstadoInstalacion } from "./instalar-photocraft";
import { correr } from "./proceso";
import { ESTUDIO } from "./rutas";

export interface AppCraft {
  /** Nombre del repo y de la carpeta (p. ej. «vectorcraft»). */
  app: string;
  version: string;
  /** Devuelve la versión instalada o null (para comprobar que arranca). */
  verificar: () => Promise<string | null>;
  /** Archivo de la release (por defecto, el tarball de Linux x86_64). */
  archivo?: string;
  /** Carpeta dentro de ~/dev/video-tools (por defecto, `app`). */
  carpeta?: string;
  /** Formato del archivo (por defecto, tar.gz). */
  extraer?: "tar" | "zip";
  /** Carpeta de primer nivel dentro del archivo a la que apunta `actual` (por defecto, el nombre del tarball sin extensión). */
  raiz?: string;
  /** Ajustes después de descomprimir, sobre la carpeta a la que apuntará `actual`. */
  preparar?: (dir: string) => Promise<void>;
}

export function crearInstalador(c: AppCraft) {
  const base = `https://github.com/storytold/${c.app}/releases/download/v${c.version}`;
  const tarball = c.archivo ?? `${c.app}-${c.version}-linux-x86_64.tar.gz`;
  const raiz = c.raiz ?? `${c.app}-${c.version}-linux-x86_64`;
  const dir = path.join(ESTUDIO, c.carpeta ?? c.app);
  let estado: EstadoInstalacion = { fase: "inactiva", progreso: 0, detalle: "" };
  let enCurso: Promise<void> | null = null;

  async function instalar(): Promise<void> {
    if (process.platform !== "linux" || process.arch !== "x64") throw new Error("La instalación automática es para Linux x86_64 (WSL).");
    const destino = path.join(dir, c.version);
    await fs.mkdir(dir, { recursive: true });
    const tmp = await fs.mkdtemp(path.join(dir, ".instalando-"));
    try {
      estado = { fase: "descargando", progreso: 0, detalle: "Buscando la versión verificada…" };
      const rs = await fetch(`${base}/SHA256SUMS.txt`);
      if (!rs.ok) throw new Error(`GitHub respondió ${rs.status} al pedir las sumas de verificación`);
      const esperada = sumaEsperada(await rs.text(), tarball);
      if (!esperada) throw new Error("La release no publica la suma de ese archivo");

      const r = await fetch(`${base}/${tarball}`);
      if (!r.ok || !r.body) throw new Error(`GitHub respondió ${r.status} al descargar`);
      const total = Number(r.headers.get("content-length")) || 0;
      const hash = createHash("sha256");
      let bajado = 0;
      const archivo = path.join(tmp, tarball);
      const cuerpo = Readable.fromWeb(r.body as import("node:stream/web").ReadableStream<Uint8Array>);
      cuerpo.on("data", (d: Buffer) => {
        hash.update(d);
        bajado += d.length;
        const mb = (n: number) => Math.round(n / 1e6);
        estado = { fase: "descargando", progreso: total ? bajado / total : 0, detalle: `Descargando ${mb(bajado)}${total ? ` de ${mb(total)}` : ""} MB…` };
      });
      await pipeline(cuerpo, createWriteStream(archivo));

      estado = { fase: "verificando", progreso: 1, detalle: "Verificando que el archivo sea el oficial…" };
      if (hash.digest("hex") !== esperada) throw new Error("El archivo descargado no coincide con la suma oficial: no se instaló (puede ser la red; prueba de nuevo)");

      estado = { fase: "descomprimiendo", progreso: 1, detalle: "Descomprimiendo…" };
      const extraido = path.join(tmp, "x");
      await fs.mkdir(extraido);
      // zipfile de Python descarta rutas absolutas y «..» al extraer.
      if (c.extraer === "zip") await correr("python3", ["-I", "-m", "zipfile", "-e", archivo, extraido], { timeout: 300_000 });
      else await correr("tar", ["-xzf", archivo, "-C", extraido], { timeout: 300_000 });
      await c.preparar?.(path.join(extraido, raiz));
      await fs.rm(destino, { recursive: true, force: true });
      await fs.rename(extraido, destino);
      const enlaceTmp = path.join(dir, `.actual-${process.pid}`);
      await fs.rm(enlaceTmp, { force: true });
      await fs.symlink(path.join(destino, raiz), enlaceTmp);
      await fs.rename(enlaceTmp, path.join(dir, "actual"));

      const v = await c.verificar();
      if (!v?.includes(c.version)) throw new Error("Se instaló pero no arranca.");
      estado = { fase: "lista", progreso: 1, detalle: `Instalada: ${v}` };
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }

  return {
    estado: () => estado,
    /** Arranca la instalación (si no hay otra en curso) y vuelve enseguida. */
    iniciar(): EstadoInstalacion {
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
    },
  };
}
