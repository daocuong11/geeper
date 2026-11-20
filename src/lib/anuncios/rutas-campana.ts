/** Rutas de los archivos de una campaña de anuncios (sólo servidor). */
import path from "node:path";
import { dentroDe } from "../archivos";
import { dirDatos } from "../rutas";

export function dirCampana(campanaId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(campanaId)) throw new Error("Id de campaña inválido");
  return path.join(dirDatos(), "anuncios", campanaId);
}

/**
 * Imagen de una fila de la tabla (ruta relativa a ~/geeper-data, como la guarda la subida). Se resuelve
 * dentro de la carpeta de la campaña: «anuncios/<id>/../otra/x.png» o «../../geeper.db» no salen de ahí.
 */
export function imagenDeCampana(campanaId: string, relativa: string): string {
  return dentroDe(dirCampana(campanaId), path.relative(path.join("anuncios", campanaId), relativa));
}
