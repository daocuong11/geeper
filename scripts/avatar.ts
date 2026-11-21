/**
 * Avatares desde la terminal (lo mismo que la página Avatares y el panel «Presentador», sin la cola).
 * Lógica en src/lib/avatares.ts y src/lib/presentador.ts. Todo lo que genera usa toda la GPU (Wan2GP);
 * con --probar sólo valida con `wgp.py --dry-run`.
 *
 *   pnpm tsx scripts/avatar.ts --lista
 *   pnpm tsx scripts/avatar.ts crear "<descripción>" [--estilo realista|animado-3d|anime|caricatura|ilustracion|plastilina]
 *        [--fondo liso|estudio|oficina|casa|exterior] [--luz …] [--look …] [--semilla N] [--probar]
 *   pnpm tsx scripts/avatar.ts guardar <propuesta> <toma> "<nombre>"
 *   pnpm tsx scripts/avatar.ts retocar <avatar> "<instrucción>"
 *   pnpm tsx scripts/avatar.ts presentador <slug> <avatar> [--burbuja] [--esquina abajo-derecha] [--escenas 1,3]
 *        [--calidad normal|alta] [--probar]
 */
import { crearPropuesta, generarPropuesta, guardarAvatar, listarAvatares, Pedido, probarPropuesta, retocarAvatar } from "../src/lib/avatares";
import { db } from "../src/lib/db";
import { escenasEnLinea } from "../src/lib/linea";
import { generarPresentador, probarPresentador, type OpcionesPresentador } from "../src/lib/presentador";
import { versionDeProyecto } from "../src/lib/render";
import { dirProyecto } from "../src/lib/rutas";
import type { Avance } from "../src/lib/wan2gp";

function leerBanderas(args: string[]) {
  const pos: string[] = [];
  const op: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith("--")) pos.push(a);
    else if (["--probar", "--burbuja", "--lista"].includes(a)) op[a.slice(2)] = "1";
    else {
      const v = args[++i];
      if (v === undefined) throw new Error(`Falta el valor de ${a}`);
      op[a.slice(2)] = v;
    }
  }
  return { pos, op };
}

function contexto(dir: string) {
  let ultimo = "";
  return {
    dir,
    log: (l: string) => console.log(l),
    alAvanzar: (a: Avance) => {
      const e = `${a.fase}${a.pasos ? ` ${a.paso}/${a.pasos}` : ""}${a.bytes ? ` ${(a.bytes / 1024 ** 3).toFixed(1)} GB` : ""}`;
      if (e !== ultimo) console.log(`  ${(ultimo = e)} (${Math.round(a.avance * 100)} %)`);
    },
  };
}

async function main() {
  const { pos, op } = leerBanderas(process.argv.slice(2));
  const [accion, ...resto] = pos;
  if (op.lista || accion === "lista") {
    const as = await listarAvatares();
    if (!as.length) console.log("No hay avatares todavía.");
    for (const a of as) console.log(`${a.id.padEnd(28)} ${a.nombre.padEnd(20)} ${a.estilo.padEnd(11)} ${a.versiones.length} retoques · ${a.licencia}`);
    return;
  }
  if (accion === "crear") {
    const pedido = Pedido.parse({ descripcion: resto.join(" "), estilo: op.estilo, fondo: op.fondo, luz: op.luz, look: op.look, semilla: op.semilla ? Number(op.semilla) : undefined });
    const id = await crearPropuesta({ pedido });
    console.log(`Propuesta ${id}`);
    if (op.probar) {
      const r = await probarPropuesta(id);
      console.log(r.mensaje);
      process.exitCode = r.ok ? 0 : 1;
      return;
    }
    const r = await generarPropuesta(contexto(dirProyecto("sistema")), id);
    console.log(`Tomas (en ~/geeper-data):\n  ${r.tomas.join("\n  ")}\nGuarda una con: pnpm tsx scripts/avatar.ts guardar ${id} <toma> "<nombre>"`);
    return;
  }
  if (accion === "guardar") {
    const [propuesta, toma, ...nombre] = resto;
    const a = await guardarAvatar(propuesta ?? "", Number(toma), nombre.join(" "));
    console.log(`Guardado: ${a.id}`);
    return;
  }
  if (accion === "retocar") {
    const [id, ...instr] = resto;
    const a = await retocarAvatar(contexto(dirProyecto("sistema")), id ?? "", instr.join(" "));
    console.log(`Retocado: ${a.id} (${a.versiones.length} retoques; se deshace desde la página Avatares)`);
    return;
  }
  if (accion === "presentador") {
    const [slug, avatar] = resto;
    if (!slug || !avatar) throw new Error("Uso: presentador <slug> <avatar> [--burbuja] [--escenas 1,3] [--probar]");
    const fila = await db.proyecto.findUniqueOrThrow({ where: { slug } });
    const { p, numero } = await versionDeProyecto(fila.id);
    const todas = escenasEnLinea(p);
    const escenas = op.escenas?.split(",").map((x) => {
      const e = /^\d+$/.test(x.trim()) ? todas[Number(x) - 1] : todas.find((y) => y.escena.id === x.trim());
      if (!e) throw new Error(`No hay escena ${x}`);
      return e.escena.id;
    });
    const opciones: OpcionesPresentador = {
      avatar,
      modo: op.burbuja ? "burbuja" : "pantalla",
      escenas,
      calidad: op.calidad as OpcionesPresentador["calidad"],
      marco: op.esquina ? { esquina: op.esquina as never } : undefined,
    };
    const dir = dirProyecto(slug);
    if (op.probar) {
      const r = await probarPresentador(dir, p, opciones);
      console.log(`Proyecto ${slug} v${numero} · ${r.plan.modo} · ${r.plan.segundos.toFixed(1)} s · ${r.ajustes.video_length} cuadros · ${r.ajustes.resolution}`);
      for (const n of [...r.plan.notas, ...r.plan.avisos]) console.log(`- ${n}`);
      console.log(r.mensaje);
      process.exitCode = r.ok ? 0 : 1;
      return;
    }
    const r = await generarPresentador(contexto(dir), fila.id, p, opciones);
    console.log(`Listo en ${r.segundos} s → versión ${r.version}`);
    return;
  }
  throw new Error("Acciones: --lista · crear · guardar · retocar · presentador (ver el comentario de scripts/avatar.ts)");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
