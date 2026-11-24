import { json, manejar } from "@/lib/http";
import { estadoInstalacion, iniciarInstalacion } from "@/lib/instalar-photocraft";
import { versionPhotocraft } from "@/lib/photocraft";

export const dynamic = "force-dynamic";

/** Si la herramienta de portadas y colores está instalada y cómo va su instalación. */
export async function GET() {
  return manejar(async () => json({ version: await versionPhotocraft(), ...estadoInstalacion() }));
}

/** Instala PhotoCraft (descarga oficial verificada con SHA256). Vuelve enseguida; el avance se lee con GET. */
export async function POST() {
  return manejar(async () => json(iniciarInstalacion(), 202));
}
