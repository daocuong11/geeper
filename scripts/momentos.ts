/**
 * Uso: pnpm tsx scripts/momentos.ts <url|archivo> [--top 8] [--min 15] [--max 40] [--idioma es]
 *        [--chat chat.json] [--max-minutos 90] [--sin-transcribir]
 *
 * Busca los momentos fuertes de un material largo (VOD, video, grabación) y deja
 * ~/geeper-data/_fuentes/<id>/candidatos.{json,md}. Primero puntúa sin transcribir (sonoridad, «lo más
 * visto» de YouTube, chat); después transcribe sólo los candidatos. No descarga directos en vivo.
 * Lo mismo se hace desde la página Clips de la web.
 */
import path from "node:path";
import { aMarkdown, buscarMomentos } from "../src/lib/buscar-momentos";
import { dirFuentes } from "../src/lib/fuentes";

function opcion(args: string[], nombre: string): string | undefined {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
}
const num = (x: string | undefined) => (x === undefined ? undefined : Number(x));

async function main() {
  const args = process.argv.slice(2);
  const src = args[0];
  if (!src || src.startsWith("--")) {
    console.error("Uso: pnpm tsx scripts/momentos.ts <url|archivo> [--top 8] [--min 15] [--max 40] [--idioma es] [--chat chat.json] [--max-minutos 90] [--sin-transcribir]");
    process.exit(2);
  }
  const r = await buscarMomentos(
    {
      src,
      top: num(opcion(args, "--top")),
      min: num(opcion(args, "--min")),
      max: num(opcion(args, "--max")),
      idioma: opcion(args, "--idioma"),
      maxMinutos: num(opcion(args, "--max-minutos")),
      chat: opcion(args, "--chat"),
      transcribir: !args.includes("--sin-transcribir"),
    },
    (l) => console.error(l),
  );
  console.log(aMarkdown(r));
  console.error(`→ ${path.join(dirFuentes(), r.fuente, "candidatos.md")}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
