import { quitarDiseno, subirDiseno } from "@/lib/apariencia";
import { Formato } from "@/lib/esquema";
import { json, manejar } from "@/lib/http";
import { versionPhotocraft } from "@/lib/photocraft";

export const dynamic = "force-dynamic";

/** Sube un diseño de portada propio (.psd): se revisa, se explica y, si sirve, queda para su formato. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return manejar(async () => {
    const { slug } = await ctx.params;
    if (!(await versionPhotocraft())) throw new Error("Falta la herramienta de portadas. Instálala con un clic en Sistema.");
    const archivo = (await req.formData()).get("archivo");
    if (!(archivo instanceof File)) throw new Error("Elige un archivo .psd");
    const r = await subirDiseno(slug, archivo.name, Buffer.from(await archivo.arrayBuffer()));
    return json(r, r.revision.ok ? 201 : 200);
  });
}

/** Quita el diseño propio de un formato: el canal vuelve a los diseños listos. */
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return manejar(async () => {
    const { slug } = await ctx.params;
    await quitarDiseno(slug, Formato.parse(new URL(req.url).searchParams.get("formato")));
    return json({ ok: true });
  });
}
