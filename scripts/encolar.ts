/** Uso: pnpm tsx scripts/encolar.ts <slug> <tipo> ['{"payload":"json"}'] — encola un trabajo a mano. */
import { encolar, TIPOS, type TipoTrabajo } from "../src/lib/cola";
import { db } from "../src/lib/db";

async function main() {
  const [slug, tipo, json = "{}"] = process.argv.slice(2);
  if (!slug || !tipo || !(tipo in TIPOS)) throw new Error(`Uso: <slug> <${Object.keys(TIPOS).join("|")}> [payload]`);
  const p = await db.proyecto.findUniqueOrThrow({ where: { slug } });
  const t = await encolar(p.id, tipo as TipoTrabajo, JSON.parse(json));
  console.log(`Encolado ${t.tipo} ${t.id}`);
  await db.$disconnect();
}
void main();
