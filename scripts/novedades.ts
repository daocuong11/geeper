/**
 * Novedades de los repos integrados (docs/fuentes.json). Lo usa la skill /novedades.
 *
 *   pnpm tsx scripts/novedades.ts                     informe de todo lo que cambió (consulta ya)
 *   pnpm tsx scripts/novedades.ts <id>                detalle de una fuente: notas completas y commits
 *   pnpm tsx scripts/novedades.ts --probar <id> <ver> baja el CLI <ver> a una carpeta temporal y corre sus
 *                                                     pruebas contra él (photocraft, vectorcraft, hyperframes);
 *                                                     no toca lo instalado
 *   pnpm tsx scripts/novedades.ts --marcar <id> [--version X] [--commit sha]
 *                                                     deja la fuente revisada hasta hoy (después de portar)
 *   --json                                            salida en JSON
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bajar } from "../src/lib/instalar-craft";
import { sumaEsperada } from "../src/lib/instalar-photocraft";
import { buscarNovedades, consultar, leerFuentes, marcarRevisada, tieneNovedades, type Fuente, type Novedad } from "../src/lib/novedades";
import { correr } from "../src/lib/proceso";

const args = process.argv.slice(2);
const json = args.includes("--json");
const opcion = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

function informe(n: Novedad, f: Fuente | undefined, completo: boolean): string {
  const l: string[] = [`## ${n.id} (${n.repo})`, `Uso en Geeper (${n.como.join(", ") || "—"}): ${n.que}`];
  l.push(`Base: ${[n.base.version && `versión ${n.base.version}`, n.base.commit && `commit ${n.base.commit}`, `revisado ${n.base.revisado}`].filter(Boolean).join(", ")}`);
  if (f?.archivos?.length) l.push(`Archivos de Geeper que dependen de esto: ${f.archivos.join(", ")}`);
  if (f?.docs) l.push(`Documentación: ${f.docs}`);
  if (f?.pruebas?.length) l.push(`Pruebas: ${f.pruebas.join(", ")}`);
  if (n.error) l.push(`ERROR al consultar: ${n.error}`);
  for (const r of n.nuevas.slice(0, completo ? 20 : 3)) {
    l.push(`\n### Versión ${r.version} (${r.fecha}) ${r.url}`);
    if (r.notas) l.push(completo ? r.notas : r.notas.slice(0, 600) + (r.notas.length > 600 ? " …" : ""));
  }
  if (n.commits.length) {
    l.push(`\n### Commits desde ${n.base.revisado}${n.masCommits ? " (hay más)" : ""}`);
    for (const c of n.commits.slice(0, completo ? 30 : 8)) l.push(`- ${c.sha} ${c.fecha} ${c.mensaje}`);
    if (n.base.commit && n.commits[0]) l.push(`Diff completo: https://github.com/${n.repo}/compare/${n.base.commit}...${n.commits[0].sha}`);
  }
  return l.join("\n");
}

/** Prueba un CLI candidato sin instalarlo: carpeta temporal + variables GEEPER_<APP> y GEEPER_<APP>_VERSION. */
async function probar(f: Fuente, version: string): Promise<boolean> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `geeper-probar-${f.id}-`));
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((x): x is [string, string] => x[1] !== undefined));
  try {
    if (f.id === "hyperframes") {
      env.GEEPER_HYPERFRAMES_VERSION = version;
    } else if (f.id === "photocraft" || f.id === "vectorcraft") {
      const base = `https://github.com/${f.repo}/releases/download/v${version}`;
      const tar = `${f.id}-${version}-linux-x86_64.tar.gz`;
      const esperada = sumaEsperada(await (await bajar(`${base}/SHA256SUMS.txt`)).text(), tar);
      if (!esperada) throw new Error(`La release ${version} no publica la suma de ${tar}`);
      const datos = Buffer.from(await (await bajar(`${base}/${tar}`)).arrayBuffer());
      if (createHash("sha256").update(datos).digest("hex") !== esperada) throw new Error("El archivo no coincide con la suma oficial");
      await fs.writeFile(path.join(tmp, tar), datos);
      await correr("tar", ["-xzf", path.join(tmp, tar), "-C", tmp]);
      const bin = path.join(tmp, `${f.id}-${version}-linux-x86_64`, "bin", `${f.id}-cli`);
      const v = await correr(bin, ["--version"], { permitirFallo: true });
      console.log(`Candidato: ${v.stdout.trim() || v.stderr.trim()}`);
      env[`GEEPER_${f.id.toUpperCase()}`] = bin;
      env[`GEEPER_${f.id.toUpperCase()}_VERSION`] = version;
    } else {
      throw new Error(`--probar sirve para photocraft, vectorcraft y hyperframes; ${f.id} se revisa leyendo sus cambios`);
    }
    const pruebas = f.pruebas ?? [];
    console.log(`Corriendo ${pruebas.join(" ") || "todas las pruebas"} con ${f.id} ${version}…`);
    const r = await correr("npx", ["vitest", "run", ...pruebas], { env, permitirFallo: true, timeout: 900_000 });
    console.log(r.stdout.split("\n").filter((x) => /Test Files|Tests |FAIL|✓|×|skipped/.test(x)).slice(-25).join("\n"));
    return r.codigo === 0;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const fuentes = await leerFuentes();
  const porId = new Map(fuentes.map((f) => [f.id, f]));

  const marcar = opcion("--marcar");
  if (marcar) {
    const f = await marcarRevisada(marcar, { version: opcion("--version"), commit: opcion("--commit") });
    console.log(`docs/fuentes.json: ${f.id} revisado ${f.revisado}${f.version ? `, versión ${f.version}` : ""}${f.commit ? `, commit ${f.commit}` : ""}.`);
    return;
  }

  const aProbar = opcion("--probar");
  if (aProbar) {
    const f = porId.get(aProbar);
    const v = args[args.indexOf("--probar") + 2];
    if (!f || !v) throw new Error("Uso: --probar <id> <versión>");
    const ok = await probar(f, v.replace(/^v/i, ""));
    console.log(ok ? `✓ ${f.id} ${v} pasa las pruebas de Geeper.` : `✗ ${f.id} ${v} rompe pruebas de Geeper: no cambies la versión fijada sin arreglarlas.`);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  const id = args.find((a) => !a.startsWith("--"));
  if (id) {
    const f = porId.get(id);
    if (!f) throw new Error(`No hay una fuente «${id}». Hay: ${[...porId.keys()].join(", ")}`);
    const n = await consultar(f);
    console.log(json ? JSON.stringify(n, null, 2) : informe(n, f, true));
    return;
  }

  const inf = await buscarNovedades({ forzar: true });
  const con = inf.novedades.filter((n) => tieneNovedades(n) || n.error);
  if (json) {
    console.log(JSON.stringify(con, null, 2));
    return;
  }
  if (!con.length) {
    console.log("Todo al día: ningún repo integrado cambió desde su última revisión.");
    return;
  }
  console.log(`# Novedades de los repos integrados (${inf.fecha.slice(0, 10)})\n`);
  console.log(con.map((n) => informe(n, porId.get(n.id), false)).join("\n\n"));
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
