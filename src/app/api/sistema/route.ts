import { diagnosticar } from "@/lib/doctor";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ chequeos: await diagnosticar() });
}
