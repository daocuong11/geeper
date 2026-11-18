/**
 * Cifrado de tokens con AES-256-GCM. La clave (32 bytes) vive en ~/.config/geeper/clave, fuera de
 * la base y del repo: sin ella, la base no sirve para tomar las cuentas (PUBLICAR.md §6).
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dirConfig } from "./config";

export const rutaClave = () => path.join(dirConfig(), "clave");

let cache: { ruta: string; clave: Buffer } | null = null;

/** Lee la clave; si no existe, la crea (permisos 600). */
export function obtenerClave(): Buffer {
  const ruta = rutaClave();
  if (cache?.ruta === ruta) return cache.clave;
  let clave: Buffer;
  try {
    clave = fs.readFileSync(ruta);
  } catch {
    fs.mkdirSync(path.dirname(ruta), { recursive: true, mode: 0o700 });
    clave = randomBytes(32);
    // wx: si otro proceso la creó a la vez, se usa la suya.
    try {
      fs.writeFileSync(ruta, clave, { mode: 0o600, flag: "wx" });
    } catch {
      clave = fs.readFileSync(ruta);
    }
  }
  if (clave.length !== 32) throw new Error(`${ruta} debe tener 32 bytes (tiene ${clave.length})`);
  cache = { ruta, clave };
  return clave;
}

export function existeClave(): boolean {
  return fs.existsSync(rutaClave());
}

const VERSION = "v1";

export function cifrar(texto: string, clave = obtenerClave()): string {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave, nonce);
  const ct = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `${VERSION}:${Buffer.concat([nonce, c.getAuthTag(), ct]).toString("base64")}`;
}

export class ErrorClave extends Error {}

export function descifrar(cifrado: string, clave = obtenerClave()): string {
  const [v, datos] = cifrado.split(":");
  if (v !== VERSION || !datos) throw new ErrorClave("Token cifrado con un formato desconocido");
  const b = Buffer.from(datos, "base64");
  try {
    const d = createDecipheriv("aes-256-gcm", clave, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch {
    throw new ErrorClave("No se pudo descifrar el token: la clave de ~/.config/geeper/clave cambió. Reconecta la cuenta.");
  }
}

/** HMAC con una subclave derivada (para firmar la cookie de OAuth sin reusar la clave de cifrado). */
export function firmar(texto: string, uso: string, clave = obtenerClave()): string {
  const sub = createHmac("sha256", clave).update(`geeper:${uso}`).digest();
  return createHmac("sha256", sub).update(texto).digest("base64url");
}
