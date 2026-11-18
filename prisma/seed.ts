import { db } from "../src/lib/db";
import { PLANTILLAS_INICIALES } from "../src/lib/plantillas";
import { existeClave, obtenerClave, rutaClave } from "../src/lib/redes/cifrado";

async function main() {
  for (const p of PLANTILLAS_INICIALES) {
    // No pisa una plantilla que la persona ya editó: sólo crea las que faltan.
    await db.plantilla.upsert({ where: { slug: p.slug }, create: p, update: {} });
  }
  // Clave de cifrado de los tokens de las redes (PUBLICAR.md §6): se crea una sola vez, fuera del repo.
  if (!existeClave()) {
    obtenerClave();
    console.log(`Clave de cifrado de tokens creada en ${rutaClave()} (permisos 600). Respáldala: sin ella hay que reconectar las cuentas.`);
  }
  console.log(`Plantillas: ${(await db.plantilla.findMany()).map((p) => p.nombre).join(", ")}`);
}

main().finally(() => db.$disconnect());
