import { z } from "zod";
import { arrancarComfyui, PUERTO_EDITOR, type Servidor } from "@/lib/comfyui";
import { json, manejar } from "@/lib/http";
import { revisarComfyui } from "@/lib/instalar-comfyui";
import { argsNodos, infoNodos, leerPermisos } from "@/lib/nodos-comfy";

export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __editorComfy?: { srv: Servidor | null; arrancando: Promise<Servidor> | null } };
const estado = () => (g.__editorComfy ??= { srv: null, arrancando: null });
const vivo = (s: Servidor | null) => !!s && s.hijo.exitCode === null && s.hijo.signalCode === null;

export async function GET() {
  return manejar(async () => {
    const e = estado();
    return json({ abierto: vivo(e.srv), arrancando: !!e.arrancando, url: vivo(e.srv) ? e.srv!.url : null });
  });
}

/**
 * Abre o cierra el editor completo de ComfyUI (para los workflows que Geeper no corre solo). Mientras está
 * abierto usa la tarjeta de video: conviene cerrarlo al terminar.
 */
export async function POST(req: Request) {
  return manejar(async () => {
    const { accion } = z.object({ accion: z.enum(["abrir", "cerrar"]) }).parse(await req.json());
    const e = estado();
    if (accion === "cerrar") {
      await e.srv?.detener();
      e.srv = null;
      return json({ abierto: false });
    }
    if (revisarComfyui().falta) throw new Error("ComfyUI no está instalado");
    if (!vivo(e.srv)) {
      // El editor carga los paquetes de la comunidad que ya permitiste e instalaste, nada más.
      const listos = (await infoNodos(Object.keys(await leerPermisos()))).filter((n) => n.permitido && n.instalado).map((n) => n.id);
      e.arrancando ??= arrancarComfyui({ puerto: PUERTO_EDITOR, gpuSolo: false, nodos: argsNodos(listos) }).finally(() => (e.arrancando = null));
      e.srv = await e.arrancando;
    }
    return json({ abierto: true, url: e.srv!.url });
  });
}
