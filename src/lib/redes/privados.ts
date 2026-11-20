/**
 * Los archivos secretos de Geeper, explicados para alguien sin conocimientos técnicos: qué es cada
 * uno, si está protegido y si Geeper puede protegerlo solo (botón «Protegerlos ahora»).
 */
import fs from "node:fs";
import path from "node:path";
import { protegerPrivado, revisarPrivado, type EstadoPrivado } from "./archivo-privado";
import { rutaClave } from "./cifrado";
import { dirConfig, rutaRedes } from "./config";

export interface ArchivoPrivado {
  id: "clave" | "redes";
  nombre: string;
  ruta: string;
  estado: EstadoPrivado;
  modo?: string;
  /** Hay un problema (falta no lo es: se crea solo o se configura después). */
  problema: boolean;
  /** Geeper puede arreglarlo con el botón. */
  arreglable: boolean;
  mensaje: string;
}

const NOMBRES = {
  clave: "La llave que protege las cuentas conectadas",
  redes: "Los datos de acceso de las apps de redes",
} as const;

function mensaje(estado: EstadoPrivado): string {
  switch (estado) {
    case "ok": return "Protegido: sólo tu usuario puede abrirlo.";
    case "falta": return "Todavía no existe (se crea al configurar las redes o al conectar la primera cuenta).";
    case "abierto": return "Otros usuarios de esta computadora podrían abrirlo. Geeper no lo usa hasta que esté protegido.";
    case "enlace": return "Es un acceso directo a otro archivo. Por seguridad Geeper no lo usa ni lo cambia solo.";
    case "ajeno": return "Pertenece a otro usuario de la computadora. Por seguridad Geeper no lo usa ni lo cambia solo.";
    case "raro": return "No es un archivo normal. Por seguridad Geeper no lo usa ni lo cambia solo.";
  }
}

export function revisarPrivados(): ArchivoPrivado[] {
  const archivos = [
    { id: "clave" as const, ruta: rutaClave() },
    { id: "redes" as const, ruta: rutaRedes() },
  ];
  return archivos.map(({ id, ruta }) => {
    const { estado, modo } = revisarPrivado(ruta);
    return {
      id, nombre: NOMBRES[id], ruta, estado, modo,
      problema: estado !== "ok" && estado !== "falta",
      arreglable: estado === "abierto",
      mensaje: mensaje(estado),
    };
  });
}

/** ¿Algún archivo secreto impide usar las redes? */
export const privadosBloquean = () => revisarPrivados().some((a) => a.problema);

/** Protege lo que se puede (archivos y su carpeta) y devuelve cómo quedó todo. */
export function protegerPrivados(): ArchivoPrivado[] {
  for (const a of revisarPrivados()) if (a.arreglable) protegerPrivado(a.ruta);
  // La carpeta también: 700 si es tuya y no es un enlace.
  try {
    const dir = dirConfig();
    const st = fs.lstatSync(dir);
    if (st.isDirectory() && st.uid === process.getuid?.() && st.mode & 0o077) fs.chmodSync(path.resolve(dir), 0o700);
  } catch {
    /* sin carpeta todavía */
  }
  return revisarPrivados();
}
