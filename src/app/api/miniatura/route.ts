import fs from "node:fs/promises";
import path from "node:path";
import { dentroDe, existe } from "@/lib/archivos";
import { fotograma } from "@/lib/media";
import { dirProyecto } from "@/lib/rutas";
import { CSP_SVG } from "@/lib/svg";

export const dynamic = "force-dynamic";

/** Miniatura de un asset de video (se guarda en assets/miniaturas/ la primera vez). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const slug = u.searchParams.get("p") ?? "";
  const ruta = u.searchParams.get("ruta") ?? "";
  const t = Math.max(0, Number(u.searchParams.get("t") ?? 0.5));
  try {
    const dir = dirProyecto(slug);
    const origen = dentroDe(dir, ruta);
    if (/\.(jpe?g|png|webp)$/i.test(origen)) {
      return new Response(new Uint8Array(await fs.readFile(origen)), { headers: { "content-type": "image/jpeg" } });
    }
    if (/\.svg$/i.test(origen)) {
      return new Response(new Uint8Array(await fs.readFile(origen)), {
        headers: { "content-type": "image/svg+xml", "content-security-policy": CSP_SVG },
      });
    }
    const destino = path.join(dir, "assets", "miniaturas", `${path.parse(ruta).name}-${t.toFixed(1)}.jpg`);
    if (!(await existe(destino))) {
      await fs.mkdir(path.dirname(destino), { recursive: true });
      await fotograma(origen, t, destino, 240);
    }
    return new Response(new Uint8Array(await fs.readFile(destino)), { headers: { "content-type": "image/jpeg", "cache-control": "max-age=3600" } });
  } catch {
    return new Response("Sin miniatura", { status: 404 });
  }
}
