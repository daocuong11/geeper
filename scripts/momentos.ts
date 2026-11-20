/**
 * Uso: pnpm tsx scripts/momentos.ts <url|archivo> [--top 8] [--min 15] [--max 40] [--idioma es]
 *        [--chat chat.json] [--max-minutos 90] [--sin-transcribir]
 *
 * Busca los momentos fuertes de un material largo (VOD, video, grabación) y deja
 * ~/geeper-data/_fuentes/<id>/candidatos.{json,md}. Primero puntúa sin transcribir (sonoridad, «lo más
 * visto» de YouTube, chat); después transcribe sólo los candidatos para ajustar los bordes a frases y
 * sumar las palabras de emoción. No descarga directos en vivo.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { escribirAtomico } from "../src/lib/archivos";
import type { Palabra } from "../src/lib/esquema";
import { traerFuente } from "../src/lib/fuentes";
import { ffmpeg } from "../src/lib/media";
import {
  ajustarBordes, chatTwitch, chatYoutube, contarEmocion, dbPorSegundo, elegirVentanas, OPCIONES_MOMENTOS, puntajeFinal, puntuar, type Candidato,
} from "../src/lib/momentos";
import { transcribir } from "../src/lib/voz";

function opcion(args: string[], nombre: string): string | undefined {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

async function main() {
  const args = process.argv.slice(2);
  const src = args[0];
  if (!src || src.startsWith("--")) {
    console.error("Uso: pnpm tsx scripts/momentos.ts <url|archivo> [--top 8] [--min 15] [--max 40] [--idioma es] [--chat chat.json] [--max-minutos 90] [--sin-transcribir]");
    process.exit(2);
  }
  const o = {
    top: Number(opcion(args, "--top") ?? OPCIONES_MOMENTOS.top),
    min: Number(opcion(args, "--min") ?? OPCIONES_MOMENTOS.min),
    max: Number(opcion(args, "--max") ?? OPCIONES_MOMENTOS.max),
  };
  const idioma = opcion(args, "--idioma") ?? "es";
  const maxMinutos = Number(opcion(args, "--max-minutos") ?? 90);
  const log = (l: string) => console.error(l);

  const f = await traerFuente(src, { maxMinutos, log });
  console.error(`Fuente ${f.id}: «${f.info.titulo}» de ${f.info.canal ?? "?"} (${(f.info.duracion / 60).toFixed(1)} min)`);
  const t0 = Date.now();
  const db = await dbPorSegundo(f.video, maxMinutos * 60);
  const n = db.length;
  let chat: number[] | undefined;
  const chatArg = opcion(args, "--chat");
  if (chatArg) chat = chatTwitch(JSON.parse(await fs.readFile(chatArg, "utf8")), n);
  else if (f.chat) chat = chatYoutube(await fs.readFile(f.chat, "utf8"), n);
  const p = puntuar({ db, heatmap: f.info.heatmap ?? undefined, chat });
  let cands: Candidato[] = elegirVentanas(p, n, o);
  console.error(`Señales en ${((Date.now() - t0) / 1000).toFixed(0)} s: sonoridad${f.info.heatmap ? ", lo más visto" : ""}${chat ? ", chat" : ""}. ${cands.length} candidatos.`);

  if (!args.includes("--sin-transcribir")) {
    const dir = path.join(f.dir, "candidatos");
    await fs.mkdir(dir, { recursive: true });
    for (const c of cands) {
      const a0 = Math.max(0, c.inicio - 2);
      const a1 = Math.min(n, c.fin + 2);
      const wav = path.join(dir, `c${c.n}-${a0.toFixed(0)}.wav`);
      await ffmpeg(["-ss", a0.toFixed(2), "-t", (a1 - a0).toFixed(2), "-i", f.video, "-vn", "-ac", "1", "-ar", "16000", wav]);
      const w = await transcribir(wav, idioma, () => {});
      const palabras: Palabra[] = w.map((x) => ({ texto: x.text.trim(), inicio: x.start + a0, fin: x.end + a0 })).filter((x) => x.texto);
      const b = ajustarBordes(c, palabras, o, n);
      const dentro = palabras.filter((x) => x.inicio >= b.inicio && x.fin <= b.fin + 0.05);
      Object.assign(c, b, { texto: dentro.map((x) => x.texto).join(" ").slice(0, 400), emocion: contarEmocion(dentro) });
      c.puntaje = puntajeFinal(c);
      if (c.emocion) c.motivos.push(`${c.emocion} palabras de emoción`);
      console.error(`  ${c.n}. ${mmss(c.inicio)}–${mmss(c.fin)} transcrito`);
    }
  }
  cands = [...cands].sort((a, b) => b.puntaje - a.puntaje);

  const md = [
    `# Candidatos: ${f.info.titulo}`,
    `Fuente: ${f.info.url} · ${f.info.canal ?? "?"} · id \`${f.id}\``,
    "",
    ...cands.flatMap((c) => [
      `## ${c.n}. ${mmss(c.inicio)}–${mmss(c.fin)} (${(c.fin - c.inicio).toFixed(0)} s) · puntaje ${c.puntaje}`,
      `Por qué: ${c.motivos.join(", ")}`,
      ...(c.texto ? [`> ${c.texto}`] : []),
      `\`pnpm tsx scripts/importar-clip.ts ${f.id} ${c.inicio} ${c.fin} --encuadre react --idioma ${idioma}\``,
      "",
    ]),
  ].join("\n");
  await escribirAtomico(path.join(f.dir, "candidatos.json"), JSON.stringify({ fuente: f.id, info: f.info, opciones: o, candidatos: cands }, null, 1));
  await escribirAtomico(path.join(f.dir, "candidatos.md"), md);
  console.log(md);
  console.error(`→ ${path.join(f.dir, "candidatos.md")}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
