/** pnpm run doctor — diagnóstico de solo lectura. Sale con 1 si algo esencial falla. */
import { diagnosticar } from "../src/lib/doctor";

async function main() {
  const r = await diagnosticar();
  for (const c of r) {
    const amarillo = (!c.ok && c.aviso) || (c.ok && c.aviso && c.arreglo);
    const marca = amarillo ? "\x1b[33m!\x1b[0m" : c.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`${marca} ${c.nombre}: ${c.detalle}`);
    if (c.arreglo && (!c.ok || c.aviso)) console.log(`    → ${c.arreglo}`);
  }
  const malos = r.filter((c) => !c.ok && !c.aviso);
  console.log(malos.length ? `\n${malos.length} problema(s) por resolver.` : "\nTodo en verde.");
  process.exit(malos.length ? 1 : 0);
}
void main();
