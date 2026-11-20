import { json, manejar } from "@/lib/http";
import { estadoInstalacionVectorcraft, iniciarInstalacionVectorcraft } from "@/lib/instalar-vectorcraft";
import { versionVectorcraft } from "@/lib/vectorcraft";

export const dynamic = "force-dynamic";

/** Si la herramienta de logos vectoriales está instalada y cómo va su instalación. */
export async function GET() {
  return manejar(async () => json({ version: await versionVectorcraft(), ...estadoInstalacionVectorcraft() }));
}

/** Instala VectorCraft (descarga oficial verificada con SHA256). Vuelve enseguida; el avance se lee con GET. */
export async function POST() {
  return manejar(async () => json(iniciarInstalacionVectorcraft(), 202));
}
