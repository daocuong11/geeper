/**
 * Apps Craft que no tienen versión web (hoy, AniCraft): en Windows y Linux se instala su programa de
 * escritorio oficial (zip portable o tarball, verificado con SHA256SUMS.txt, con el mismo instalador que
 * PhotoCraft) en <herramientas>/<app>-escritorio y Geeper lo abre en su propia ventana. En macOS sólo
 * publican un .dmg (hay que arrastrarlo a Aplicaciones): ahí queda el enlace de descarga.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { APPS_CRAFT, type AppCraft } from "./craft-web";
import { crearInstalador, type EstadoInstalacion } from "./instalar-craft";
import { cliCraft, exe, SISTEMA } from "./plataforma";
import { correr } from "./proceso";
import { dirDatos, ESTUDIO } from "./rutas";

/** Este sistema puede instalar y abrir los programas de escritorio de Craft. */
export const ESCRITORIO_CRAFT = SISTEMA === "windows" || (SISTEMA === "linux" && process.arch === "x64");

export const appEscritorio = (app: string): AppCraft | null => APPS_CRAFT.find((a) => a.app === app && a.soloEscritorio) ?? null;

const dirApp = (app: string) => path.join(ESTUDIO, `${app}-escritorio`);
const cli = (app: string) => cliCraft(dirApp(app), `${app}-cli`);
/** El programa con ventana: al lado del CLI (Windows: raíz del zip; Linux: bin/). */
export const programa = (app: string) => path.join(path.dirname(cli(app)), exe(app));

/** Versión instalada («anicraft-cli 0.2.1») o null. */
export async function versionEscritorio(app: string): Promise<string | null> {
  if (!ESCRITORIO_CRAFT || !existsSync(cli(app))) return null;
  const r = await correr(cli(app), ["--version"], { permitirFallo: true, timeout: 20_000 }).catch(() => null);
  return r?.codigo === 0 ? r.stdout.trim().split("\n")[0]! : null;
}

const g = globalThis as unknown as { __craftEscritorio?: Map<string, ReturnType<typeof crearInstalador>> };
function instalador(a: AppCraft) {
  const m = (g.__craftEscritorio ??= new Map());
  let i = m.get(a.app);
  if (!i) {
    i = crearInstalador({ app: a.app, version: a.version, carpeta: `${a.app}-escritorio`, verificar: () => versionEscritorio(a.app) });
    m.set(a.app, i);
  }
  return i;
}

export const instalacionEscritorio = (a: AppCraft): EstadoInstalacion | null => (ESCRITORIO_CRAFT ? instalador(a).estado() : null);

export function instalarEscritorio(a: AppCraft): EstadoInstalacion {
  if (!ESCRITORIO_CRAFT) throw new Error(`${a.nombre} sólo publica un instalador para este sistema: descárgalo desde su página.`);
  return instalador(a).iniciar();
}

/** Abre el programa en su propia ventana, sin atarlo a Geeper (sigue abierto si Geeper se cierra). */
export function abrirEscritorio(a: AppCraft): void {
  const p = programa(a.app);
  if (!existsSync(p)) throw new Error(`${a.nombre} no está instalada.`);
  const hijo = spawn(p, [], { cwd: dirDatos(), detached: true, stdio: "ignore", windowsHide: false });
  hijo.on("error", () => {});
  hijo.unref();
}
