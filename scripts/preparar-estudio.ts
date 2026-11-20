/**
 * «Preparar el estudio» desde la terminal (lo mismo que el botón de Sistema en la app de escritorio).
 * Sirve para probarlo fuera de Electron simulando la app:
 *
 *   GEEPER_ESCRITORIO=1 GEEPER_HERRAMIENTAS=/tmp/h GEEPER_DATA=/tmp/d \
 *     GEEPER_HYPERFRAMES_CLI=escritorio-app/node_modules/hyperframes/bin/hyperframes.mjs \
 *     pnpm tsx scripts/preparar-estudio.ts [--solo-revisar]
 */
import { esperarEstudio, prepararEstudio, revisarEstudio, type EstadoEstudio } from "../src/lib/estudio";

function mostrar(e: EstadoEstudio) {
  for (const p of e.pasos) console.log(`${({ listo: "✓", aviso: "!", error: "✗", falta: "·" } as Record<string, string>)[p.estado] ?? "?"} ${p.nombre}: ${p.detalle || p.estado}`);
}

async function main() {
  if (process.argv.includes("--solo-revisar")) return mostrar(await revisarEstudio());
  prepararEstudio();
  let visto = 0;
  const t = setInterval(() => {
    const { registro } = (globalThis as unknown as { __estudio: { estado: EstadoEstudio } }).__estudio.estado;
    for (const l of registro.slice(visto)) console.log(l);
    visto = registro.length;
  }, 500);
  const e = await esperarEstudio();
  clearInterval(t);
  for (const l of e.registro.slice(visto)) console.log(l);
  console.log("");
  mostrar(e);
  if (e.pasos.some((p) => p.estado === "error")) process.exitCode = 1;
}

void main();
