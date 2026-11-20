/**
 * Lectura de archivos secretos (la clave de cifrado, redes.json). Se rechaza el archivo si es un
 * enlace simbólico, si no es un archivo normal, si es de otro usuario o si el grupo u otros pueden
 * leerlo o escribirlo: quien pudiera cambiarlo podría poner su propia clave o sus credenciales.
 * La idea viene del archivo de control de PdfCraft (docs/HEREDADO.md, «storytold»).
 *
 * Se abre con O_NOFOLLOW y se valida con fstat sobre el mismo descriptor: entre la comprobación y la
 * lectura el archivo no se puede cambiar por otro.
 */
import fs from "node:fs";

export class ErrorArchivoPrivado extends Error {}

const POSIX = process.platform !== "win32";

/** Lee el archivo. Si no existe lanza el ENOENT original (el llamador decide qué hacer). */
export function leerPrivado(ruta: string): Buffer {
  const banderas = fs.constants.O_RDONLY | (POSIX ? fs.constants.O_NOFOLLOW : 0);
  let fd: number;
  try {
    fd = fs.openSync(ruta, banderas);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ELOOP") {
      throw new ErrorArchivoPrivado(`${ruta} es un enlace simbólico: usa el archivo real (chmod 600).`);
    }
    throw e;
  }
  try {
    if (POSIX) {
      const st = fs.fstatSync(fd);
      if (!st.isFile()) throw new ErrorArchivoPrivado(`${ruta} no es un archivo normal.`);
      const uid = process.getuid?.();
      if (uid !== undefined && st.uid !== uid) {
        throw new ErrorArchivoPrivado(`${ruta} es de otro usuario (uid ${st.uid}): debe ser tuyo.`);
      }
      if (st.mode & 0o077) {
        const modo = (st.mode & 0o777).toString(8);
        throw new ErrorArchivoPrivado(`${ruta} tiene permisos ${modo}: otros pueden leerlo o cambiarlo. Arreglo: chmod 600 ${ruta}`);
      }
    }
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export const noExiste = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT";

/** Cómo está un archivo secreto, sin leer su contenido (para el diagnóstico y la UI). */
export type EstadoPrivado = "ok" | "falta" | "abierto" | "enlace" | "ajeno" | "raro";

export function revisarPrivado(ruta: string): { estado: EstadoPrivado; modo?: string } {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(ruta);
  } catch (e) {
    if (noExiste(e)) return { estado: "falta" };
    throw e;
  }
  if (!POSIX) return { estado: "ok" };
  if (st.isSymbolicLink()) return { estado: "enlace" };
  if (!st.isFile()) return { estado: "raro" };
  const uid = process.getuid?.();
  if (uid !== undefined && st.uid !== uid) return { estado: "ajeno" };
  const modo = (st.mode & 0o777).toString(8);
  return st.mode & 0o077 ? { estado: "abierto", modo } : { estado: "ok", modo };
}

/**
 * Deja el archivo en 600. Sólo arregla el caso «abierto» (archivo normal y propio): un enlace o un
 * archivo de otro usuario no se toca, porque arreglarlo solo podría proteger el archivo equivocado.
 * Se cambia sobre el descriptor abierto sin seguir enlaces (no hay carrera entre revisar y cambiar).
 */
export function protegerPrivado(ruta: string): EstadoPrivado {
  const antes = revisarPrivado(ruta).estado;
  if (antes !== "abierto") return antes;
  const fd = fs.openSync(ruta, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.uid !== process.getuid?.()) return "raro";
    fs.fchmodSync(fd, 0o600);
  } finally {
    fs.closeSync(fd);
  }
  return revisarPrivado(ruta).estado;
}
