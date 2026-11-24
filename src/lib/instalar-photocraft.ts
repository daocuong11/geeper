/**
 * Instala PhotoCraft con un clic (docs/PHOTOCRAFT.md §3). Usa el instalador genérico de las apps Craft
 * (instalar-craft.ts): baja el archivo oficial de este sistema (tarball de Linux, zip portable de
 * Windows o zip del CLI de macOS) de la versión fijada, verifica su SHA256 contra SHA256SUMS.txt, lo
 * descomprime en <herramientas>/photocraft/<versión> y apunta `actual` ahí; si la versión nueva no
 * arranca, deja la anterior.
 */
import { crearInstalador, sumaEsperada, type EstadoInstalacion } from "./instalar-craft";
import { versionPhotocraft } from "./photocraft";
import { PHOTOCRAFT_VERSION } from "./rutas";

export { sumaEsperada, type EstadoInstalacion };

const g = globalThis as unknown as { __instaladorPhotocraft?: ReturnType<typeof crearInstalador> };
const instalador = (g.__instaladorPhotocraft ??= crearInstalador({ app: "photocraft", version: PHOTOCRAFT_VERSION, verificar: versionPhotocraft }));

export function estadoInstalacion(): EstadoInstalacion {
  return instalador.estado();
}

/** Arranca la instalación (si no hay otra en curso) y vuelve enseguida. */
export function iniciarInstalacion(): EstadoInstalacion {
  return instalador.iniciar();
}
