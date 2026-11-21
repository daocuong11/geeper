/**
 * Fija los «nodos extra» de ComfyUI que piden las plantillas: para cada paquete del registro oficial
 * (api.comfy.org) toma la última versión en estado «activo» (salta las «marcadas» por su revisión),
 * baja el .zip, calcula su sha256 y lo escribe en src/lib/nodos-comfy.json. Geeper sólo instala lo
 * que está en ese archivo y comprueba la huella al bajarlo. Se corre a mano (o desde /novedades):
 *
 *   pnpm tsx scripts/fijar-nodos-comfy.ts [ruta/al/index.json]
 *
 * Sin ruta, lee el índice de plantillas del ComfyUI instalado.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { leerCatalogo } from "../src/lib/comfyui";
import type { NodoFijado } from "../src/lib/nodos-comfy";

const API = "https://api.comfy.org";

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { "user-agent": "geeper" } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

interface NodoApi { id: string; name: string; repository?: string; license?: string; publisher?: { id: string; name?: string }; status?: string }
interface VersionApi { version: string; status: string; downloadUrl?: string; dependencies?: string[]; deprecated?: boolean; createdAt: string }

async function paquetes(): Promise<string[]> {
  const ruta = process.argv[2];
  if (ruta) {
    const indice = JSON.parse(await fs.readFile(ruta, "utf8")) as { templates?: { requiresCustomNodes?: string[] }[] }[];
    return [...new Set(indice.flatMap((c) => (c.templates ?? []).flatMap((t) => t.requiresCustomNodes ?? [])))];
  }
  const { workflows } = await leerCatalogo();
  return [...new Set(workflows.flatMap((w) => w.complementos))];
}

function licencia(l?: string): string {
  if (!l) return "";
  try {
    const x = JSON.parse(l) as { text?: string; file?: string };
    return x.text ?? (x.file ? `ver ${x.file}` : "");
  } catch {
    return l;
  }
}

async function main() {
  const ids = (await paquetes()).sort((a, b) => a.localeCompare(b));
  const salida: Record<string, NodoFijado | { error: string }> = {};
  for (const id of ids) {
    try {
      const n = await json<NodoApi>(`${API}/nodes/${encodeURIComponent(id)}`);
      const versiones = await json<VersionApi[]>(`${API}/nodes/${encodeURIComponent(id)}/versions`);
      const v = versiones.find((x) => x.status === "NodeVersionStatusActive" && !x.deprecated && x.downloadUrl);
      if (!v?.downloadUrl) throw new Error("sin versión activa");
      const zip = Buffer.from(await (await fetch(v.downloadUrl)).arrayBuffer());
      salida[id] = {
        nombre: n.name,
        version: v.version,
        fecha: v.createdAt.slice(0, 10),
        url: v.downloadUrl,
        sha256: createHash("sha256").update(zip).digest("hex"),
        bytes: zip.length,
        autor: n.publisher?.name || n.publisher?.id || "",
        repo: n.repository ?? "",
        licencia: licencia(n.license),
        dependencias: v.dependencies ?? [],
      };
      console.log(`${id}: ${v.version}`);
    } catch (e) {
      salida[id] = { error: e instanceof Error ? e.message : String(e) };
      console.log(`${id}: NO (${salida[id] && "error" in salida[id] ? (salida[id] as { error: string }).error : ""})`);
    }
  }
  const destino = path.join(import.meta.dirname, "..", "src", "lib", "nodos-comfy.json");
  await fs.writeFile(destino, `${JSON.stringify({ fijado: new Date().toISOString().slice(0, 10), paquetes: salida }, null, 2)}\n`);
  console.log(`Escrito ${destino}`);
}
void main();
