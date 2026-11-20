import { json, manejar } from "@/lib/http";
import { crearInstalador } from "@/lib/instalar-craft";
import { VECTORCRAFT_VERSION } from "@/lib/rutas";
import { versionVectorcraft } from "@/lib/vectorcraft";

export const dynamic = "force-dynamic";

// Una instancia por proceso del servidor: el estado de la instalación vive aquí.
const g = globalThis as unknown as { __instaladorVectorcraft?: ReturnType<typeof crearInstalador> };
const instalador = (g.__instaladorVectorcraft ??= crearInstalador({ app: "vectorcraft", version: VECTORCRAFT_VERSION, verificar: versionVectorcraft }));

/** Si la herramienta de logos vectoriales está instalada y cómo va su instalación. */
export async function GET() {
  return manejar(async () => json({ version: await versionVectorcraft(), ...instalador.estado() }));
}

/** Instala VectorCraft (descarga oficial verificada con SHA256). Vuelve enseguida; el avance se lee con GET. */
export async function POST() {
  return manejar(async () => json(instalador.iniciar(), 202));
}
