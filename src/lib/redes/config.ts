/**
 * Credenciales de las apps de OAuth, fuera del repo: ~/.config/geeper/redes.json (permisos 600).
 * Formato (todas las redes son opcionales):
 * {
 *   "youtube":   { "clientId": "...", "clientSecret": "..." },
 *   "tiktok":    { "clientKey": "...", "clientSecret": "...", "publicacionDirecta": false },
 *   "instagram": { "appId": "...", "appSecret": "..." },
 *   "facebook":  { "appId": "...", "appSecret": "..." }
 * }
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { IdRed } from "./tipos";

export function dirConfig(): string {
  return process.env.GEEPER_CONFIG ?? path.join(os.homedir(), ".config", "geeper");
}

export const rutaRedes = () => path.join(dirConfig(), "redes.json");

/** URL base de Geeper para los redirect URIs (docs/PUBLICAR.md §7). */
export function urlBase(): string {
  return (process.env.GEEPER_URL ?? "http://localhost:3300").replace(/\/$/, "");
}

export function urlCallback(red: IdRed): string {
  return `${urlBase()}/api/cuentas/callback/${red}`;
}

const Config = z.object({
  youtube: z.object({ clientId: z.string().min(1), clientSecret: z.string().min(1) }).optional(),
  tiktok: z.object({ clientKey: z.string().min(1), clientSecret: z.string().min(1), publicacionDirecta: z.boolean().default(false) }).optional(),
  instagram: z.object({ appId: z.string().min(1), appSecret: z.string().min(1) }).optional(),
  facebook: z.object({ appId: z.string().min(1), appSecret: z.string().min(1) }).optional(),
});
export type ConfigRedes = z.infer<typeof Config>;

export function leerConfig(): ConfigRedes {
  let crudo: string;
  try {
    crudo = fs.readFileSync(rutaRedes(), "utf8");
  } catch {
    return {};
  }
  const r = Config.safeParse(JSON.parse(crudo));
  if (!r.success) throw new Error(`${rutaRedes()} no tiene el formato esperado: ${r.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return r.data;
}

/** Credenciales de una red, o error claro si faltan. */
export function credenciales<K extends IdRed>(red: K): NonNullable<ConfigRedes[K]> {
  const c = leerConfig()[red];
  if (!c) throw new Error(`Faltan las credenciales de ${red} en ${rutaRedes()} (ver docs/PUBLICAR.md §6)`);
  return c as NonNullable<ConfigRedes[K]>;
}

export function configurada(red: IdRed): boolean {
  try {
    return !!leerConfig()[red];
  } catch {
    return false;
  }
}

/** Permisos del archivo de credenciales: debe ser 600. */
export function permisosRedes(): string | null {
  try {
    return (fs.statSync(rutaRedes()).mode & 0o777).toString(8);
  } catch {
    return null;
  }
}
