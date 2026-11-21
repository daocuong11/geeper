/**
 * Credenciales de las apps de OAuth desde la UI (Cuentas → «Apps de las redes»): se cargan una vez, se
 * guardan en redes.json (privado, config.ts) y se pasan al equipo en un archivo cifrado con contraseña.
 * La API nunca devuelve un secreto: sólo si está y el final del ID para reconocerlo.
 *
 * Archivo del equipo (.geeper-redes): JSON con la configuración cifrada con AES-256-GCM; la clave sale
 * de la contraseña con scrypt y una sal aleatoria. Sin la contraseña no se puede leer, y si alguien lo
 * cambia, GCM lo detecta al importarlo.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { z } from "zod";
import { escribirPrivado } from "./archivo-privado";
import { Config, leerConfig, rutaRedes, urlCallback, type ConfigRedes } from "./config";
import { REDES_IDS, type IdRed } from "./tipos";

export interface Campo {
  clave: string;
  etiqueta: string;
  secreto: boolean;
  tipo?: "texto" | "si-no";
  ayuda?: string;
}

/** Qué pide cada red y dónde se saca (docs/PUBLICAR.md §6 y §7). */
export const APPS: Record<IdRed, { nombre: string; consola: string; campos: Campo[]; pasos: string[] }> = {
  youtube: {
    nombre: "YouTube",
    consola: "https://console.cloud.google.com/apis/credentials",
    campos: [
      { clave: "clientId", etiqueta: "ID de cliente", secreto: false },
      { clave: "clientSecret", etiqueta: "Secreto del cliente", secreto: true },
    ],
    pasos: [
      "En Google Cloud, crea un proyecto (o usa uno de Dimerso).",
      "Activa «YouTube Data API v3» en la biblioteca de APIs.",
      "En «Pantalla de consentimiento de OAuth», elige «Externo» y agrega como usuarios de prueba los correos que van a conectar canales.",
      "En «Credenciales» → «Crear credenciales» → «ID de cliente de OAuth», tipo «Aplicación web».",
      "En «URIs de redireccionamiento autorizados», pega el redirect URI de abajo.",
      "Copia el ID de cliente y el secreto aquí.",
    ],
  },
  tiktok: {
    nombre: "TikTok",
    consola: "https://developers.tiktok.com/apps",
    campos: [
      { clave: "clientKey", etiqueta: "Client key", secreto: false },
      { clave: "clientSecret", etiqueta: "Client secret", secreto: true },
      { clave: "publicacionDirecta", etiqueta: "Publicación directa aprobada", secreto: false, tipo: "si-no", ayuda: "Sólo si TikTok ya aprobó «Direct Post». Si no, los videos llegan como borrador a la app de TikTok." },
    ],
    pasos: [
      "En TikTok for Developers, crea una app (tipo escritorio).",
      "Agrega los productos «Login Kit» y «Content Posting API».",
      "En Login Kit, registra el redirect URI de abajo (TikTok acepta localhost con puerto en escritorio).",
      "Copia la Client key y el Client secret aquí.",
    ],
  },
  instagram: {
    nombre: "Instagram",
    consola: "https://developers.facebook.com/apps",
    campos: [
      { clave: "appId", etiqueta: "ID de la app", secreto: false },
      { clave: "appSecret", etiqueta: "Clave secreta de la app", secreto: true },
    ],
    pasos: [
      "En Meta for Developers, crea una app de tipo «Empresa» (puede ser la misma que la de Facebook).",
      "Agrega «Instagram» → «API con inicio de sesión de Instagram».",
      "En la configuración del inicio de sesión, pega el redirect URI de abajo.",
      "En modo desarrollo, agrega las cuentas de Instagram como evaluadoras.",
      "Copia el ID y la clave secreta de la app («Configuración» → «Básica») aquí.",
    ],
  },
  facebook: {
    nombre: "Facebook",
    consola: "https://developers.facebook.com/apps",
    campos: [
      { clave: "appId", etiqueta: "ID de la app", secreto: false },
      { clave: "appSecret", etiqueta: "Clave secreta de la app", secreto: true },
    ],
    pasos: [
      "En Meta for Developers, crea una app de tipo «Empresa» (o usa la de Instagram).",
      "Agrega «Inicio de sesión con Facebook» y pega el redirect URI de abajo en «URI de redireccionamiento de OAuth válidos».",
      "En modo desarrollo, agrega a las personas que van a conectar páginas como administradoras o evaluadoras.",
      "Copia el ID y la clave secreta de la app («Configuración» → «Básica») aquí.",
    ],
  },
};

/** «1234567890-abc.apps.googleusercontent.com» → «…ercontent.com»: para reconocerlo sin mostrarlo entero. */
const finDe = (v: string) => (v.length <= 6 ? "…" : `…${v.slice(-6)}`);

export interface ResumenApp {
  red: IdRed;
  nombre: string;
  configurada: boolean;
  /** Final del ID (nunca el secreto). */
  id: string | null;
  redirect: string;
  consola: string;
  campos: Campo[];
  pasos: string[];
  /** Si hay datos que no son secretos (p. ej. publicacionDirecta). */
  opciones: Record<string, boolean>;
}

export function resumenApps(config: ConfigRedes = leerConfig()): ResumenApp[] {
  return REDES_IDS.map((red) => {
    const a = APPS[red];
    const c = config[red] as Record<string, unknown> | undefined;
    const idCampo = a.campos.find((x) => !x.secreto && x.tipo !== "si-no")!.clave;
    const opciones = Object.fromEntries(a.campos.filter((x) => x.tipo === "si-no").map((x) => [x.clave, c?.[x.clave] === true]));
    return { red, nombre: a.nombre, configurada: !!c, id: c ? finDe(String(c[idCampo])) : null, redirect: urlCallback(red), consola: a.consola, campos: a.campos, pasos: a.pasos, opciones };
  });
}

function escribir(config: ConfigRedes) {
  escribirPrivado(rutaRedes(), `${JSON.stringify(config, null, 2)}\n`);
}

/** Valida y guarda las credenciales de una red (las demás quedan como estaban). Quita espacios pegados de más. */
export function guardarApp(red: IdRed, datos: Record<string, unknown>): void {
  const limpio = Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
  const forma = Config.shape[red];
  const r = forma.safeParse(limpio);
  if (!r.success) throw new Error(`Faltan datos de ${APPS[red].nombre}: ${r.error.issues.map((i) => APPS[red].campos.find((c) => c.clave === i.path[0])?.etiqueta ?? i.path.join(".")).join(", ")}`);
  escribir({ ...leerConfig(), [red]: r.data });
}

export function borrarApp(red: IdRed): void {
  const c = { ...leerConfig() };
  delete c[red];
  escribir(c);
}

const Archivo = z.object({
  formato: z.literal("geeper-redes"),
  version: z.literal(1),
  kdf: z.object({ n: z.number().int(), r: z.number().int(), p: z.number().int(), sal: z.string() }),
  iv: z.string(),
  tag: z.string(),
  datos: z.string(),
});

const KDF = { n: 2 ** 15, r: 8, p: 1 };
const clave = (contrasena: string, sal: Buffer, k: { n: number; r: number; p: number }) =>
  scryptSync(contrasena.normalize("NFC"), sal, 32, { N: k.n, r: k.r, p: k.p, maxmem: 256 * k.n * k.r });

export const CONTRASENA_MIN = 10;

/** Todas las credenciales cifradas con la contraseña, para pasarlas al equipo. */
export function exportarApps(contrasena: string, config: ConfigRedes = leerConfig()): string {
  if (contrasena.length < CONTRASENA_MIN) throw new Error(`La contraseña tiene que tener al menos ${CONTRASENA_MIN} caracteres.`);
  if (!Object.keys(config).length) throw new Error("No hay credenciales para exportar todavía.");
  const sal = randomBytes(16);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(contrasena, sal, KDF), iv);
  const datos = Buffer.concat([c.update(JSON.stringify(config), "utf8"), c.final()]);
  return JSON.stringify({ formato: "geeper-redes", version: 1, kdf: { ...KDF, sal: sal.toString("base64") }, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), datos: datos.toString("base64") }, null, 2);
}

/** Lee un archivo del equipo. Devuelve la configuración que trae (sin guardarla). */
export function abrirArchivo(texto: string, contrasena: string): ConfigRedes {
  let a: z.infer<typeof Archivo>;
  try {
    a = Archivo.parse(JSON.parse(texto));
  } catch {
    throw new Error("Ese archivo no es una exportación de credenciales de Geeper.");
  }
  // Un archivo armado a mano podría pedir un scrypt enorme y colgar el servidor.
  if (a.kdf.n > 2 ** 17 || a.kdf.r > 16 || a.kdf.p > 4) throw new Error("El archivo pide un cifrado fuera de lo normal: no lo abro.");
  try {
    const d = createDecipheriv("aes-256-gcm", clave(contrasena, Buffer.from(a.kdf.sal, "base64"), a.kdf), Buffer.from(a.iv, "base64"));
    d.setAuthTag(Buffer.from(a.tag, "base64"));
    const plano = Buffer.concat([d.update(Buffer.from(a.datos, "base64")), d.final()]).toString("utf8");
    return Config.parse(JSON.parse(plano));
  } catch {
    throw new Error("La contraseña no es la correcta (o el archivo está dañado).");
  }
}

/** Importa las credenciales del archivo: las redes que trae reemplazan a las de este equipo; las demás quedan. */
export function importarApps(texto: string, contrasena: string): IdRed[] {
  const nuevas = abrirArchivo(texto, contrasena);
  escribir({ ...leerConfig(), ...nuevas });
  return REDES_IDS.filter((r) => nuevas[r]);
}
