/**
 * Carcasa de escritorio de Geeper (Electron). No tiene lógica propia: arranca los mismos dos procesos
 * que `pnpm run dev:up` (el servidor de Next en modo standalone y el worker) con el Node de Electron
 * (ELECTRON_RUN_AS_NODE), les dice dónde viven los datos y las herramientas de este sistema, y abre una
 * ventana con la web en 127.0.0.1. Ver docs/ESCRITORIO.md.
 *
 * Estructura dentro de la app instalada (resources/app, sin asar: los hijos leen archivos reales):
 *   main.cjs, preparar-db.mjs, worker.mjs, esquema.sql
 *   standalone/            servidor de Next (server.js, .next, public)
 *   node_modules/          dependencias de los hijos (better-sqlite3 para Electron, hyperframes…)
 *   py/, docs/fuentes.json lo que lee el código en tiempo de ejecución
 *   recursos/ffmpeg/       ffmpeg y ffprobe de este sistema (verificados en el empaquetado)
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { app, BrowserWindow, dialog, Menu, shell } from "electron";

const RAIZ = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..", "escritorio-app");
const hijos: { nombre: string; p: ChildProcess }[] = [];
let ventana: BrowserWindow | null = null;
let saliendo = false;
let url = "";

const dirLogs = () => path.join(app.getPath("userData"), "logs");
function log(nombre: string): fs.WriteStream {
  fs.mkdirSync(dirLogs(), { recursive: true });
  return fs.createWriteStream(path.join(dirLogs(), `${nombre}.log`), { flags: "a" });
}

/** Entorno de los hijos: dónde viven las cosas en este sistema (src/lib/plataforma.ts lo lee). */
function entorno(puerto: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    GEEPER_ESCRITORIO: "1",
    GEEPER_DOCUMENTOS: app.getPath("documents"),
    GEEPER_APPDATA: app.getPath("userData"),
    // Herramientas pesadas (venvs, modelos, CLIs): en Windows en Local, no en Roaming (que se sincroniza).
    GEEPER_HERRAMIENTAS: process.platform === "win32" && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Geeper", "herramientas") : path.join(app.getPath("userData"), "herramientas"),
    GEEPER_RECURSOS: path.join(RAIZ, "recursos"),
    GEEPER_REPO: RAIZ,
    GEEPER_HYPERFRAMES_CLI: path.join(RAIZ, "node_modules", "hyperframes", "bin", "hyperframes.mjs"),
    PORT: String(puerto),
    HOSTNAME: "127.0.0.1",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

function lanzar(nombre: string, script: string, env: NodeJS.ProcessEnv, cwd = RAIZ): ChildProcess {
  const salida = log(nombre);
  salida.write(`\n--- ${new Date().toISOString()} ${app.getVersion()} ---\n`);
  const p = spawn(process.execPath, [script], { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  p.stdout?.pipe(salida);
  p.stderr?.pipe(salida);
  p.on("exit", (codigo) => {
    salida.write(`--- terminó (${codigo}) ---\n`);
    if (saliendo) return;
    if (nombre === "worker") {
      // Como dev-up: si el worker muere solo, se vuelve a lanzar (al arrancar marca lo interrumpido).
      setTimeout(() => !saliendo && hijos.push({ nombre, p: lanzar(nombre, script, env, cwd) }), 3000);
    } else {
      dialog.showErrorBox("Geeper se detuvo", `El servidor de Geeper terminó (código ${codigo}). Mira ${path.join(dirLogs(), `${nombre}.log`)}.`);
      app.quit();
    }
  });
  return p;
}

/**
 * Puerto en 127.0.0.1 (nunca expuesto a la red). Se prefiere 3300: es el que tienen registrado las apps
 * de OAuth de las redes (http://localhost:3300/api/cuentas/callback/<red>). Si está ocupado, uno libre.
 */
function puertoLibre(preferido = 3300): Promise<number> {
  const probar = (p: number) =>
    new Promise<number>((ok, mal) => {
      const s = net.createServer();
      s.unref();
      s.on("error", mal);
      s.listen(p, "127.0.0.1", () => {
        const a = s.address();
        s.close(() => (typeof a === "object" && a ? ok(a.port) : mal(new Error("sin puerto"))));
      });
    });
  return probar(preferido).catch(() => probar(0));
}

async function esperarServidor(u: string, ms = 60_000): Promise<void> {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      const r = await fetch(`${u}/api/media`);
      if (r.ok) return;
    } catch {
      /* todavía no */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("El servidor de Geeper no respondió en 60 s");
}

function correrHasta(script: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((ok, mal) => {
    const salida = log("preparar-db");
    const p = spawn(process.execPath, [script], { cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    p.stdout?.pipe(salida);
    p.stderr?.pipe(salida);
    p.on("exit", (c) => (c === 0 ? ok() : mal(new Error(`No se pudo preparar la base de datos (código ${c}). Mira ${path.join(dirLogs(), "preparar-db.log")}.`))));
  });
}

async function arrancar(): Promise<void> {
  const puerto = await puertoLibre();
  url = `http://127.0.0.1:${puerto}`;
  const env = entorno(puerto);
  // Crea o pone al día las tablas antes de que los dos procesos abran la base.
  await correrHasta(path.join(RAIZ, "preparar-db.mjs"), env);
  hijos.push({ nombre: "web", p: lanzar("web", path.join(RAIZ, "standalone", "server.js"), env, path.join(RAIZ, "standalone")) });
  hijos.push({ nombre: "worker", p: lanzar("worker", path.join(RAIZ, "worker.mjs"), env) });
  await esperarServidor(url);
}

function crearVentana(): void {
  ventana = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    title: "Geeper",
    backgroundColor: "#0b0d12",
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  ventana.once("ready-to-show", () => ventana?.show());
  // Lo que sale de Geeper (GitHub, redes, «en otra pestaña») se abre en el navegador.
  ventana.webContents.setWindowOpenHandler(({ url: destino }) => {
    if (destino.startsWith(url) && !destino.includes("/craft/")) return { action: "allow" };
    void shell.openExternal(destino);
    return { action: "deny" };
  });
  ventana.webContents.on("will-navigate", (e, destino) => {
    if (!destino.startsWith(url)) {
      e.preventDefault();
      void shell.openExternal(destino);
    }
  });
  void ventana.loadURL(url);
  ventana.on("closed", () => (ventana = null));
}

function menu(): void {
  const esMac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(esMac ? [{ role: "appMenu" as const }] : []),
      { role: "editMenu" },
      {
        label: "Ver",
        submenu: [{ role: "reload", label: "Recargar" }, { role: "togglefullscreen", label: "Pantalla completa" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }],
      },
      {
        label: "Ayuda",
        submenu: [
          { label: "Abrir la carpeta de proyectos", click: () => void shell.openPath(path.join(app.getPath("documents"), "Geeper")) },
          { label: "Abrir los registros", click: () => void shell.openPath(dirLogs()) },
          { label: "Herramientas de desarrollo", accelerator: "CmdOrCtrl+Alt+I", click: () => ventana?.webContents.toggleDevTools() },
        ],
      },
    ]),
  );
}

function apagar(): void {
  if (saliendo) return;
  saliendo = true;
  // SIGINT: el worker marca lo que corría como interrumpido y suelta la GPU (igual que con Ctrl+C).
  for (const h of hijos) h.p.kill(process.platform === "win32" ? undefined : "SIGINT");
  setTimeout(() => {
    for (const h of hijos) if (h.p.exitCode === null) h.p.kill("SIGKILL");
  }, 6000).unref();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (ventana) {
      if (ventana.isMinimized()) ventana.restore();
      ventana.focus();
    }
  });
  app.whenReady().then(async () => {
    menu();
    try {
      await arrancar();
      crearVentana();
    } catch (e) {
      dialog.showErrorBox("No se pudo abrir Geeper", `${e instanceof Error ? e.message : String(e)}\n\nRegistros: ${dirLogs()}`);
      apagar();
      app.quit();
    }
  });
  app.on("activate", () => {
    if (!ventana && url) crearVentana();
  });
  app.on("window-all-closed", () => {
    apagar();
    app.quit();
  });
  app.on("before-quit", apagar);
}
