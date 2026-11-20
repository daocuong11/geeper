import { json, manejar } from "@/lib/http";
import { radar } from "@/lib/tendencias";

export const dynamic = "force-dynamic";

/** Radar: videos recientes de un tema por vistas por hora (yt-dlp; se guarda una hora). */
export async function GET(req: Request) {
  return manejar(async () => {
    const u = new URL(req.url);
    const horas = Math.min(168, Math.max(1, Number(u.searchParams.get("horas") ?? 24)));
    return json(await radar(u.searchParams.get("q") ?? "", horas, Number(u.searchParams.get("limite") ?? 30)));
  });
}
