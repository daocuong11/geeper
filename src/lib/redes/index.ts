/** Registro de redes. Cada adaptador exporta un objeto que cumple `Red` (ver tipos.ts). */
import { facebook } from "./facebook";
import { instagram } from "./instagram";
import { tiktok } from "./tiktok";
import type { IdRed, Perfil, Red } from "./tipos";
import { REDES_IDS } from "./tipos";
import { youtube } from "./youtube";

export const REDES: Record<IdRed, Red> = { youtube, tiktok, instagram, facebook };

let reemplazos: Partial<Record<IdRed, Red>> = {};
/** Para pruebas: reemplaza un adaptador por uno falso. */
export function usarRed(id: IdRed, red: Red | null) {
  if (red) reemplazos[id] = red;
  else {
    const { [id]: _quitado, ...resto } = reemplazos;
    void _quitado;
    reemplazos = resto;
  }
}

export function esIdRed(x: string): x is IdRed {
  return (REDES_IDS as string[]).includes(x);
}

export function obtenerRed(id: string): Red {
  if (!esIdRed(id)) throw new Error(`Red desconocida: ${id}`);
  return reemplazos[id] ?? REDES[id];
}

export function admite(red: Red, perfil: string): boolean {
  return red.formatos.includes(perfil as Perfil);
}
