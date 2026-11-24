/**
 * Instala VectorCraft con un clic (logos .ai/.pdf/.eps → SVG y vectorizar), con el instalador genérico
 * de las apps Craft (instalar-craft.ts). Una instancia por proceso del servidor: el estado vive aquí.
 */
import { crearInstalador, type EstadoInstalacion } from "./instalar-craft";
import { VECTORCRAFT_VERSION } from "./rutas";
import { versionVectorcraft } from "./vectorcraft";

const g = globalThis as unknown as { __instaladorVectorcraft?: ReturnType<typeof crearInstalador> };
const instalador = (g.__instaladorVectorcraft ??= crearInstalador({ app: "vectorcraft", version: VECTORCRAFT_VERSION, verificar: versionVectorcraft }));

export function estadoInstalacionVectorcraft(): EstadoInstalacion {
  return instalador.estado();
}

/** Arranca la instalación (si no hay otra en curso) y vuelve enseguida. */
export function iniciarInstalacionVectorcraft(): EstadoInstalacion {
  return instalador.iniciar();
}
