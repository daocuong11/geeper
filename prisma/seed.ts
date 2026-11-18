import { db } from "../src/lib/db";
import { PLANTILLAS_INICIALES } from "../src/lib/plantillas";

async function main() {
  for (const p of PLANTILLAS_INICIALES) {
    // No pisa una plantilla que la persona ya editó: sólo crea las que faltan.
    await db.plantilla.upsert({ where: { slug: p.slug }, create: p, update: {} });
  }
  console.log(`Plantillas: ${(await db.plantilla.findMany()).map((p) => p.nombre).join(", ")}`);
}

main().finally(() => db.$disconnect());
