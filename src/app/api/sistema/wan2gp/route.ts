import { json, manejar } from "@/lib/http";
import { instalarWan2gp, revisarWan2gp } from "@/lib/instalar-wan2gp";
import { estadoModelos, instalacionWan2gp } from "@/lib/wan2gp";

export const dynamic = "force-dynamic";

/** Si Wan2GP (para animar escenas) está instalado, sus modelos y cómo va la instalación. */
export async function GET() {
  return manejar(async () => {
    const e = revisarWan2gp();
    return json({ ...e, modelos: e.falta ? null : estadoModelos(instalacionWan2gp()) });
  });
}

/** Instala Wan2GP (código fijado, Python, PyTorch y dependencias). Vuelve enseguida; el avance se lee con GET. */
export async function POST() {
  return manejar(async () => json(instalarWan2gp(), 202));
}
