import { json, manejar } from "@/lib/http";
import { instalarComfyui, revisarComfyui } from "@/lib/instalar-comfyui";

export const dynamic = "force-dynamic";

/** Si ComfyUI (sección Workflows) está instalado y cómo va la instalación. */
export async function GET() {
  return manejar(async () => json(revisarComfyui()));
}

/** Instala ComfyUI (código fijado, Python, PyTorch y dependencias). Vuelve enseguida; el avance se lee con GET. */
export async function POST() {
  return manejar(async () => json(instalarComfyui(), 202));
}
