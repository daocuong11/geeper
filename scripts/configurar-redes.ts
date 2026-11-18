/**
 * pnpm tsx scripts/configurar-redes.ts — asistente para cargar las claves de cada red en
 * ~/.config/geeper/redes.json (docs/TRAMITES.md §0.4).
 *
 * Los secretos se escriben sin eco y nunca se imprimen. El archivo se reescribe de forma atómica
 * con permisos 600 y se valida con el mismo esquema que usa Geeper. Enter vacío = dejar la red como está.
 */
import fs from "node:fs";
import readline from "node:readline";
import { configurada, dirConfig, leerConfig, rutaRedes, urlCallback } from "../src/lib/redes/config";
import type { IdRed } from "../src/lib/redes/tipos";

interface Campo { clave: string; etiqueta: string; secreto?: boolean }
const REDES: { id: IdRed; nombre: string; donde: string; campos: Campo[]; extra?: Record<string, unknown> }[] = [
  {
    id: "youtube", nombre: "YouTube", donde: "Google Cloud → APIs y servicios → Credenciales → ID de cliente de OAuth (TRAMITES §2.4)",
    campos: [{ clave: "clientId", etiqueta: "Client ID" }, { clave: "clientSecret", etiqueta: "Client secret", secreto: true }],
  },
  {
    id: "tiktok", nombre: "TikTok", donde: "developers.tiktok.com → tu app → Sandbox → Client key / secret (TRAMITES §3.2)",
    campos: [{ clave: "clientKey", etiqueta: "Client key" }, { clave: "clientSecret", etiqueta: "Client secret", secreto: true }],
    extra: { publicacionDirecta: false },
  },
  {
    id: "instagram", nombre: "Instagram", donde: "Meta → caso de uso Instagram → «ID de la app de Instagram» y su clave (NO los de Facebook) (TRAMITES §4.2)",
    campos: [{ clave: "appId", etiqueta: "ID de la app de Instagram" }, { clave: "appSecret", etiqueta: "Clave secreta de Instagram", secreto: true }],
  },
  {
    id: "facebook", nombre: "Facebook", donde: "Meta → Configuración de la app → Básica → ID de la app y clave secreta (TRAMITES §4.1)",
    campos: [{ clave: "appId", etiqueta: "ID de la app" }, { clave: "appSecret", etiqueta: "Clave secreta de la app", secreto: true }],
  },
];

const tty = !!process.stdin.isTTY;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
const lineas = rl[Symbol.asyncIterator]();
let silencio = false;
// Sin eco para los secretos (solo en terminal; por tubería no hay eco).
const rlInterno = rl as unknown as { _writeToOutput: (s: string) => void };
const escribirOriginal = rlInterno._writeToOutput.bind(rl);
rlInterno._writeToOutput = (s: string) => { if (!silencio) escribirOriginal(s); };

async function preguntar(texto: string, secreto = false): Promise<string> {
  process.stdout.write(texto);
  silencio = secreto && tty;
  const r = await lineas.next();
  if (silencio) process.stdout.write("\n");
  silencio = false;
  if (!tty) process.stdout.write("\n");
  return r.done ? "" : String(r.value).trim();
}

function leerCrudo(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(rutaRedes(), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function guardar(datos: Record<string, unknown>) {
  fs.mkdirSync(dirConfig(), { recursive: true, mode: 0o700 });
  const tmp = `${rutaRedes()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, rutaRedes());
  fs.chmodSync(rutaRedes(), 0o600);
}

async function main() {
  console.log(`Credenciales de las redes → ${rutaRedes()}\nLos secretos no se muestran al escribirlos. Enter vacío = saltar esa red.\n`);
  const datos = leerCrudo();
  for (const r of REDES) {
    const ya = configurada(r.id);
    console.log(`── ${r.nombre} ${ya ? "(ya configurada)" : "(sin configurar)"}`);
    console.log(`   Dónde: ${r.donde}`);
    console.log(`   Redirect URI a registrar: ${urlCallback(r.id)}`);
    const sigue = await preguntar(`   ¿${ya ? "Reemplazar" : "Cargar"} ${r.nombre}? [s/N] `);
    if (!/^s/i.test(sigue)) { console.log(""); continue; }
    const bloque: Record<string, unknown> = { ...(r.extra ?? {}) };
    let completo = true;
    for (const c of r.campos) {
      const v = await preguntar(`   ${c.etiqueta}${c.secreto ? " (oculto)" : ""}: `, c.secreto);
      if (!v) { completo = false; break; }
      bloque[c.clave] = v;
    }
    if (!completo) { console.log("   Incompleto: no se cambió nada de esta red.\n"); continue; }
    datos[r.id] = bloque;
    console.log(`   ${r.nombre}: listo.\n`);
  }
  guardar(datos);
  try {
    const cfg = leerConfig();
    console.log(`Guardado con permisos 600. Redes configuradas: ${Object.keys(cfg).join(", ") || "ninguna"}.`);
    console.log("Siguiente: pnpm doctor, y después conectar las cuentas en http://localhost:3300/cuentas");
  } catch (e) {
    console.error(`El archivo quedó con un formato inválido: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
  rl.close();
}
void main();
