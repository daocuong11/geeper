/**
 * Empaqueta Geeper como app de escritorio para el sistema donde corre (Windows → instalador NSIS .exe,
 * macOS → .dmg, Linux → AppImage, sólo para probar). En CI lo corre .github/workflows/escritorio.yml en
 * una máquina de cada sistema. Ver docs/ESCRITORIO.md.
 *
 *   pnpm tsx scripts/escritorio/empaquetar.ts            todo: build + preparación + instalador
 *   pnpm tsx scripts/escritorio/empaquetar.ts --sin-instalador   deja escritorio-app/ lista (para probar con electron)
 *
 * Pasos: next build (standalone) → bundles con esbuild (carcasa, worker, preparar-db) → carpeta
 * escritorio-app/ con node_modules plano (npm) → better-sqlite3 recompilado para Electron → esquema.sql,
 * py/, docs/fuentes.json → ffmpeg de este sistema verificado con SHA-256 → electron-builder.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { unzipSync } from "fflate";

const REPO = path.resolve(__dirname, "..", "..");
const APP = path.join(REPO, "escritorio-app");
const ELECTRON = JSON.parse(fs.readFileSync(path.join(REPO, "node_modules", "electron", "package.json"), "utf8")).version as string;
const raiz = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8")) as { version: string; dependencies: Record<string, string> };
const sinInstalador = process.argv.includes("--sin-instalador");
const plataforma = `${process.platform}-${process.arch}`;

const win = process.platform === "win32";
function correr(cmd: string, args: string[], op: { cwd?: string; env?: Record<string, string> } = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  // En Windows npm/npx/pnpm son .cmd: hace falta la shell para encontrarlos.
  execFileSync(cmd, args, { cwd: op.cwd ?? REPO, env: { ...process.env, ...op.env }, stdio: "inherit", shell: win });
}
const copiar = (de: string, a: string) => fs.cpSync(de, a, { recursive: true, dereference: true });

async function bajarVerificado(url: string, sha256: string): Promise<Buffer> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
      const datos = Buffer.from(await r.arrayBuffer());
      const suma = createHash("sha256").update(datos).digest("hex");
      if (suma !== sha256) throw new Error(`${url}: SHA-256 ${suma}, se esperaba ${sha256}. No se empaqueta.`);
      return datos;
    } catch (e) {
      if (i >= 3 || String(e).includes("SHA-256")) throw e;
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
}

/** ffmpeg y ffprobe de este sistema en escritorio-app/recursos/ffmpeg/ (escritorio/recursos.json). */
async function ffmpeg() {
  const manifiesto = JSON.parse(fs.readFileSync(path.join(REPO, "escritorio", "recursos.json"), "utf8")).ffmpeg as Record<string, {
    archivos?: { url: string; sha256: string; sacar: Record<string, string> }[];
    copiarDe?: string[];
  }>;
  const m = manifiesto[plataforma];
  if (!m) throw new Error(`No hay ffmpeg fijado para ${plataforma} en escritorio/recursos.json`);
  const destino = path.join(APP, "recursos", "ffmpeg");
  fs.mkdirSync(destino, { recursive: true });
  for (const de of m.copiarDe ?? []) {
    const abs = de.replace(/^~/, os.homedir());
    fs.copyFileSync(abs, path.join(destino, path.basename(abs)));
  }
  for (const a of m.archivos ?? []) {
    console.log(`Bajando ${a.url}`);
    const zip = unzipSync(new Uint8Array(await bajarVerificado(a.url, a.sha256)));
    for (const [dentro, nombre] of Object.entries(a.sacar)) {
      const contenido = zip[dentro];
      if (!contenido) throw new Error(`${a.url} no trae ${dentro}`);
      fs.writeFileSync(path.join(destino, nombre), contenido);
    }
  }
  if (!win) for (const f of fs.readdirSync(destino)) fs.chmodSync(path.join(destino, f), 0o755);
  console.log(`ffmpeg: ${fs.readdirSync(destino).join(", ")}`);
}

/** Bundles de la carcasa (CJS, la carga Electron) y de los procesos hijos (ESM, los corre su Node). */
async function bundles() {
  const comun = { bundle: true, platform: "node" as const, target: "node22", sourcemap: true, logLevel: "warning" as const, alias: { "@": path.join(REPO, "src") } };
  await build({ ...comun, entryPoints: [path.join(REPO, "escritorio", "main.ts")], outfile: path.join(APP, "main.cjs"), format: "cjs", external: ["electron"] });
  // ESM: el cliente de Prisma generado usa import.meta. `require` para las dependencias CJS empaquetadas.
  const banner = { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" };
  for (const [entrada, salida] of [["worker/index.ts", "worker.mjs"], ["escritorio/preparar-db.ts", "preparar-db.mjs"]] as const) {
    await build({ ...comun, entryPoints: [path.join(REPO, entrada)], outfile: path.join(APP, salida), format: "esm", banner, external: ["better-sqlite3"] });
  }
}

async function main() {
  console.log(`Geeper ${raiz.version} para ${plataforma} (Electron ${ELECTRON})`);
  fs.rmSync(APP, { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });

  // 1. Next standalone.
  correr("pnpm", ["exec", "next", "build"], { env: { GEEPER_STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1" } });
  const standalone = path.join(APP, "standalone");
  const dist = path.join(REPO, ".next-escritorio");
  copiar(path.join(dist, "standalone"), standalone);
  copiar(path.join(dist, "static"), path.join(standalone, ".next-escritorio", "static"));
  if (fs.existsSync(path.join(REPO, "public"))) copiar(path.join(REPO, "public"), path.join(standalone, "public"));

  // 2. Bundles.
  await bundles();

  // 3. node_modules plano (npm, sin los enlaces de pnpm, que no sobreviven al instalador) con las
  //    versiones exactas que usa el servidor, más Hyperframes (se corre como CLI). better-sqlite3 es la
  //    versión del adaptador de Prisma: un solo módulo nativo, recompilado para Electron.
  const real = (paquete: string) => fs.realpathSync(path.join(REPO, "node_modules", paquete));
  const versionDe = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version as string;
  const adaptador = real("@prisma/adapter-better-sqlite3");
  const deps: Record<string, string> = {
    next: versionDe(real("next")),
    react: versionDe(real("react")),
    "react-dom": versionDe(real("react-dom")),
    "@prisma/client": versionDe(real("@prisma/client")),
    "@prisma/adapter-better-sqlite3": versionDe(adaptador),
    "better-sqlite3": versionDe(path.join(adaptador, "..", "..", "better-sqlite3")),
    hyperframes: process.env.GEEPER_HYPERFRAMES_VERSION ?? "0.9.27",
  };
  fs.writeFileSync(path.join(APP, "package.json"), JSON.stringify({
    name: "geeper", productName: "Geeper", version: raiz.version, private: true, main: "main.cjs",
    description: "Estudio de video local de Dimerso", author: "Dimerso", dependencies: deps,
  }, null, 2));
  // --legacy-peer-deps: @prisma/client pide `prisma` (la CLI con sus motores) como par; en la app no hace falta.
  correr("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--legacy-peer-deps"], { cwd: APP });
  correr("pnpm", ["exec", "electron-rebuild", "--version", ELECTRON, "--module-dir", APP, "--only", "better-sqlite3", "--force"]);

  // El servidor resuelve sus paquetes subiendo hasta escritorio-app/node_modules: su propio node_modules
  // (con enlaces absolutos de pnpm) sobra. Turbopack deja alias con hash (p. ej.
  // .next-escritorio/node_modules/@prisma/client-c381…) como enlaces: se cambian por copias reales.
  fs.rmSync(path.join(standalone, "node_modules"), { recursive: true, force: true });
  const alias = path.join(standalone, ".next-escritorio", "node_modules");
  if (fs.existsSync(alias)) {
    for (const e of fs.readdirSync(alias, { recursive: true, withFileTypes: true })) {
      if (!e.isSymbolicLink()) continue;
      const enlace = path.join(e.parentPath, e.name);
      const destino = fs.readlinkSync(enlace);
      const nombre = JSON.parse(fs.readFileSync(path.join(destino, "package.json"), "utf8")).name as string;
      fs.rmSync(enlace);
      copiar(path.join(APP, "node_modules", nombre), enlace);
      console.log(`alias ${path.relative(standalone, enlace)} → copia de ${nombre}`);
    }
  }
  const quedan = fs.readdirSync(APP, { recursive: true, withFileTypes: true }).filter((e) => e.isSymbolicLink() && !e.parentPath.includes(`${path.sep}node_modules${path.sep}.bin`));
  if (quedan.length) throw new Error(`Quedaron enlaces simbólicos en la app (no viajan en el instalador): ${quedan.slice(0, 5).map((e) => path.join(e.parentPath, e.name)).join(", ")}`);

  // 4. Lo que el código lee en tiempo de ejecución (RAIZ_REPO = la carpeta de la app).
  const esquema = execFileSync(win ? "npx.cmd" : "npx", ["prisma", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], { cwd: REPO, encoding: "utf8", shell: win });
  fs.writeFileSync(path.join(APP, "esquema.sql"), esquema.slice(esquema.indexOf("--")));
  copiar(path.join(REPO, "py"), path.join(APP, "py"));
  fs.rmSync(path.join(APP, "py", "__pycache__"), { recursive: true, force: true });
  fs.mkdirSync(path.join(APP, "docs"), { recursive: true });
  fs.copyFileSync(path.join(REPO, "docs", "fuentes.json"), path.join(APP, "docs", "fuentes.json"));

  // 5. ffmpeg de este sistema.
  await ffmpeg();

  if (sinInstalador) {
    console.log(`Lista: ${APP}\nProbar: pnpm exec electron ${APP}`);
    return;
  }
  // 6. Instalador.
  correr("pnpm", ["exec", "electron-builder", "--config", path.join(REPO, "escritorio", "electron-builder.yml"), "--projectDir", APP, "--publish", "never"], {
    env: { CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  });
  console.log(`Instalador en ${path.join(REPO, "dist-escritorio")}`);
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
