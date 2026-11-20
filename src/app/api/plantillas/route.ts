import path from "node:path";
import { z } from "zod";
import { db } from "@/lib/db";
import { json, manejar } from "@/lib/http";
import { DatosPlantilla } from "@/lib/plantillas";
import { dirDatos } from "@/lib/rutas";
import { slugDe } from "@/lib/servicios";

export const dynamic = "force-dynamic";

export async function GET() {
  const [plantillas, usos] = await Promise.all([
    db.plantilla.findMany({ orderBy: { nombre: "asc" } }),
    db.proyecto.groupBy({ by: ["plantilla"], _count: { _all: true } }),
  ]);
  const cuenta = new Map(usos.map((u) => [u.plantilla, u._count._all]));
  // El logo se puede ver en el editor si está dentro de ~/geeper-data (lo que sube el editor).
  const logoRuta = (datos: unknown) => {
    const logo = DatosPlantilla.safeParse(datos).data?.marca.logo;
    if (!logo) return null;
    const rel = path.relative(dirDatos(), logo);
    return rel.startsWith("..") || path.isAbsolute(rel) ? null : rel;
  };
  return json({ plantillas: plantillas.map((p) => ({ ...p, usos: cuenta.get(p.slug) ?? 0, logoRuta: logoRuta(p.datos) })) });
}

/** Crea una plantilla copiando otra (para probar cambios sin tocar la que usan los proyectos). */
export async function POST(req: Request) {
  return manejar(async () => {
    const d = z.object({ nombre: z.string().trim().min(1).max(80), base: z.string().min(1) }).parse(await req.json());
    const base = await db.plantilla.findUniqueOrThrow({ where: { slug: d.base } });
    const datos = DatosPlantilla.parse(base.datos);
    datos.descripcion = `Copia de «${base.nombre}».`;
    const p = await db.plantilla.create({ data: { slug: slugDe(d.nombre), nombre: d.nombre, datos } });
    return json({ plantilla: { slug: p.slug, nombre: p.nombre } }, 201);
  });
}
