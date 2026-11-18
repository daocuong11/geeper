import { db } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ plantillas: await db.plantilla.findMany({ orderBy: { nombre: "asc" } }) });
}
