/** Uso: pnpm tsx scripts/importar-mpt.ts <task_id> "<tema>" [formato] [plantilla] — encola importar + render. */
import { db } from "../src/lib/db";
import { Formato } from "../src/lib/esquema";
import { importarTareaMpt } from "../src/lib/servicios";

const [taskId, tema, formato = "9:16", plantilla = "gta-vi-shorts"] = process.argv.slice(2);
if (!taskId || !tema) {
  console.error('Uso: pnpm tsx scripts/importar-mpt.ts <task_id> "<tema>" [9:16|16:9|1:1] [plantilla]');
  process.exit(2);
}
async function main() {
  const p = await importarTareaMpt(taskId!, { tema: tema!, formato: Formato.parse(formato), plantilla });
  console.log(`Proyecto ${p.slug} (${p.id}) en cola`);
  await db.$disconnect();
}
void main();
