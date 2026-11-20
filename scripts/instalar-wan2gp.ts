/** Instala Wan2GP desde la terminal (lo mismo que el botón de Sistema): pnpm tsx scripts/instalar-wan2gp.ts */
import { esperarWan2gp, instalarWan2gp } from "../src/lib/instalar-wan2gp";

async function main() {
  const e = instalarWan2gp();
  let visto = 0;
  // El registro guarda sólo las últimas líneas: se imprimen las nuevas según el total anotado.
  const nuevas = () => {
    const n = Math.min(e.lineas - visto, e.registro.length);
    for (const l of n > 0 ? e.registro.slice(-n) : []) console.log(l);
    visto = e.lineas;
  };
  const t = setInterval(nuevas, 1000);
  await esperarWan2gp();
  clearInterval(t);
  nuevas();
  const fin = e;
  console.log(fin.pasos.map((p) => `${p.nombre}: ${p.estado}`).join("\n"));
  if (fin.error) {
    console.error(`Error: ${fin.error}`);
    process.exitCode = 1;
  }
}
void main();
