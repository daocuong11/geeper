/**
 * Animar una escena con Wan2GP desde la terminal (lo mismo que «Animar esta escena» en el proyecto, pero
 * sin la cola). Lógica en src/lib/plano.ts.
 *
 *   pnpm tsx scripts/plano.ts --estado                                  instalación y modelos de Wan2GP
 *   pnpm tsx scripts/plano.ts <slug> <escena> --probar [opciones]       valida con wgp.py --dry-run, sin GPU
 *   pnpm tsx scripts/plano.ts <slug> <escena> [opciones]                genera y lo guarda (usa la GPU)
 *
 * Opciones: --modelo rapido|ti2v|i2v|ltx2 (rapido) · --prompt "…" · --segundos N · --semilla N · --pasos N ·
 *   --sin-imagen · --negativo "…" · cámara: --camara --lente --focal --apertura --movimiento --plano --luz --look
 *   (src/lib/prompt-camara.ts).
 * <escena> es el id (p. ej. e03) o el número en la línea de tiempo (1 = la primera).
 */
import { db } from "../src/lib/db";
import { generarPlanoEscena, probarPlanoEscena, type OpcionesPlano } from "../src/lib/plano";
import { camaraDe } from "../src/lib/prompt-camara";
import { versionDeProyecto } from "../src/lib/render";
import { dirProyecto } from "../src/lib/rutas";
import { estadoModelos, faltaEnInstalacion, instalacionWan2gp, MODELOS_PLANO } from "../src/lib/wan2gp";

function leerBanderas(args: string[]) {
  const pos: string[] = [];
  const op: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith("--")) pos.push(a);
    else if (["--probar", "--sin-imagen", "--estado"].includes(a)) op[a.slice(2)] = "1";
    else {
      const v = args[++i];
      if (v === undefined) throw new Error(`Falta el valor de ${a}`);
      op[a.slice(2)] = v;
    }
  }
  return { pos, op };
}

const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));

async function main() {
  const { pos, op } = leerBanderas(process.argv.slice(2));
  if (op.estado) {
    const inst = instalacionWan2gp();
    const falta = faltaEnInstalacion(inst);
    console.log(falta ?? `Wan2GP en ${inst.dir} (Python: ${inst.python})`);
    if (!falta) {
      const e = estadoModelos(inst);
      for (const m of MODELOS_PLANO) console.log(`  ${m.id.padEnd(7)} ${m.nombre.padEnd(32)} ${e[m.id]!.padEnd(10)} ${m.nota}`);
    }
    return;
  }
  const [slug, escena] = pos;
  if (!slug || !escena) throw new Error("Uso: <slug> <escena> [--probar] [--modelo rapido|ti2v|i2v|ltx2] [--prompt …] [--segundos N] … (o --estado)");
  const opciones: OpcionesPlano = {
    modelo: op.modelo,
    prompt: op.prompt,
    segundos: num(op.segundos),
    semilla: num(op.semilla),
    pasos: num(op.pasos),
    negativo: op.negativo,
    sinImagen: Boolean(op["sin-imagen"]),
    camara: camaraDe(op),
  };
  const fila = await db.proyecto.findUniqueOrThrow({ where: { slug } });
  const { p, numero } = await versionDeProyecto(fila.id);
  const dir = dirProyecto(slug);

  if (op.probar) {
    const r = await probarPlanoEscena(dir, p, escena, opciones);
    console.log(`Proyecto ${slug} v${numero}, escena ${r.plan.numero} · ${r.plan.modelo.nombre} · ${r.ajustes.resolution} · ${r.ajustes.video_length} cuadros`);
    console.log(`Prompt: ${r.plan.prompt}`);
    for (const a of r.plan.avisos) console.log(`Aviso: ${a}`);
    console.log(r.mensaje);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }

  let ultimo = "";
  const r = await generarPlanoEscena(
    {
      dir,
      log: (l) => console.log(l),
      alAvanzar: (a) => {
        const linea = a.fase === "descargando" ? `bajando el modelo: ${(a.bytes! / 1024 **3).toFixed(1)} GB` : `${a.fase}${a.pasos ? ` ${a.paso}/${a.pasos}` : ""} (${Math.round(a.avance * 100)} %)`;
        if (linea !== ultimo) console.log(`  ${(ultimo = linea)}`);
      },
    },
    fila.id,
    p,
    escena,
    opciones,
  );
  console.log(`Listo en ${r.segundos} s: ${r.ruta} → versión ${r.version}. Se deshace desde «Historial».`);
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
