import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { encolar } from "@/lib/cola";
import { estadoModelos, leerCatalogo, leerWorkflowJson, modelosDeWorkflow, notasDeWorkflow, textosDeWorkflow } from "@/lib/comfyui";
import { json, manejar } from "@/lib/http";
import { revisarComfyui } from "@/lib/instalar-comfyui";
import { infoNodos, permitirNodos } from "@/lib/nodos-comfy";
import { aviso, bloqueo, dirCorrida, escribirCorrida, nuevaCorrida, PedidoWorkflow } from "@/lib/workflows";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const MAX_ARCHIVO = 500 * 1024 ** 2;
const EXT: Record<string, string[]> = { image: [".png", ".jpg", ".jpeg", ".webp"], video: [".mp4", ".mov", ".webm"], audio: [".wav", ".mp3", ".flac", ".m4a", ".ogg"] };

async function buscar(id: string) {
  const { workflows } = await leerCatalogo();
  const w = workflows.find((x) => x.id === id);
  if (!w) throw new Error("Ese workflow no está en esta versión de ComfyUI.");
  return w;
}

/** Lo que pide el workflow: archivos, textos, modelos (y cuáles faltan) y notas del autor. */
export async function GET(_: Request, ctx: Ctx) {
  return manejar(async () => {
    const { id } = await ctx.params;
    if (revisarComfyui().falta) throw new Error("ComfyUI no está instalado");
    const w = await buscar(id);
    const grafo = await leerWorkflowJson(w.id);
    const modelos = estadoModelos(modelosDeWorkflow(grafo));
    return json({
      workflow: { ...w, bloqueo: bloqueo(w), aviso: aviso(w), miniaturas: w.miniaturas.map((m) => `/api/workflows/archivo/${encodeURIComponent(m)}`) },
      textos: textosDeWorkflow(grafo),
      notas: notasDeWorkflow(grafo),
      modelos: modelos.map((m) => ({ nombre: m.nombre, carpeta: m.carpeta, listo: m.listo })),
      faltan: modelos.filter((m) => !m.listo).length,
      nodos: (await infoNodos(w.complementos)).map((n) => ({
        id: n.id,
        nombre: n.fijado?.nombre ?? n.id,
        version: n.fijado?.version ?? null,
        autor: n.fijado?.autor ?? "",
        repo: n.fijado?.repo ?? "",
        licencia: n.fijado?.licencia ?? "",
        megas: n.fijado ? Math.max(1, Math.round(n.fijado.bytes / 1024 ** 2)) : 0,
        motivo: n.motivo,
        instalado: n.instalado,
        permitido: n.permitido,
      })),
      entradas: w.entradas.map((e) => ({ ...e, ejemplo: e.archivo ? `/api/workflows/archivo/${encodeURIComponent(e.archivo)}` : null })),
    });
  });
}

/** Crea una corrida: multipart con `textos` (JSON) y un archivo por entrada (`archivo-<nodo>`). */
export async function POST(req: Request, ctx: Ctx) {
  return manejar(async () => {
    const { id } = await ctx.params;
    if (revisarComfyui().falta) throw new Error("ComfyUI no está instalado");
    const w = await buscar(id);
    const motivo = bloqueo(w);
    if (motivo) throw new Error(motivo);
    const form = await req.formData();
    if (w.complementos.length) {
      if (form.get("permitirNodos") === "1") await permitirNodos(w.complementos);
      const sin = (await infoNodos(w.complementos)).filter((n) => !n.permitido);
      if (sin.length) throw new Error("Para usar este workflow, marca la casilla que permite instalar su código de la comunidad.");
    }
    const textos = z.array(z.object({ nodo: z.string(), indice: z.number().int(), valor: z.string().max(5000) })).max(20).parse(JSON.parse(String(form.get("textos") ?? "[]")));
    const corrida = nuevaCorrida(w.id);
    const dir = dirCorrida(corrida);
    await fs.mkdir(path.join(dir, "entradas"), { recursive: true });
    const archivos: { nodo: number; nombre: string }[] = [];
    for (const e of w.entradas) {
      const f = form.get(`archivo-${e.nodo}`);
      if (!(f instanceof File) || !f.size) continue; // sin archivo: queda el ejemplo de la plantilla
      const ext = path.extname(f.name).toLowerCase();
      if (!(EXT[e.medio] ?? EXT.image!).includes(ext)) throw new Error(`Ese archivo no sirve aquí: hace falta ${e.medio === "video" ? "un video" : e.medio === "audio" ? "un audio" : "una imagen"}.`);
      if (f.size > MAX_ARCHIVO) throw new Error("El archivo pasa de 500 MB");
      const nombre = `entrada-${e.nodo}${ext}`;
      await fs.writeFile(path.join(dir, "entradas", nombre), Buffer.from(await f.arrayBuffer()));
      archivos.push({ nodo: e.nodo, nombre });
    }
    const pedido = PedidoWorkflow.parse({ workflow: w.id, textos, archivos });
    await escribirCorrida({ id: corrida, workflow: w.id, titulo: w.titulo, creada: new Date().toISOString(), estado: "preparada", salidas: [] });
    const t = await encolar(null, "workflow.correr", { corrida, pedido });
    return json({ corrida, trabajo: t.id }, 201);
  });
}
