/**
 * Render de entrega de una versión: mezcla → compilar → hyperframes check → render → loudnorm
 * (corrige) → QC (mide). Cada tramo es un paso con manifiesto: si se corta, al relanzar se saltan
 * los terminados.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { compilar, escribirProyectoHf, VERSION_COMPILADOR } from "./compilador";
import { validarProyecto, type Proyecto } from "./esquema";
import { metricas } from "./formatos";
import { tomarGpu } from "./gpu";
import { duracionEscenas, escenasEnLinea } from "./linea";
import { huellaFfmpeg } from "./media";
import { mezclar } from "./mezcla";
import { paso, type Contexto } from "./pasos";
import { obtenerPlantilla } from "./plantillas";
import { correr } from "./proceso";
import { correrQc, normalizarAudio, type InformeQc } from "./qc";
import { HYPERFRAMES_VERSION, dirProyecto } from "./rutas";
import { HF } from "./voz";

const ENV_HF = { HYPERFRAMES_TELEMETRY: "0", DO_NOT_TRACK: "1" };

export interface ResultadoRender {
  renderId: string;
  ruta: string;
  aprobado: boolean;
  gpu: boolean;
  segundos: number;
}

interface ResumenCheck {
  ok: boolean;
  errores: number;
  avisos: number;
  resumen: string;
}

function contarHallazgos(v: unknown, acc: { errores: string[]; avisos: number }) {
  if (Array.isArray(v)) v.forEach((x) => contarHallazgos(x, acc));
  else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.severity === "error") acc.errores.push(`${String(o.code ?? "")}: ${String(o.message ?? "")}`.slice(0, 300));
    else if (o.severity === "warning") acc.avisos++;
    Object.values(o).forEach((x) => contarHallazgos(x, acc));
  }
}

export async function versionDeProyecto(proyectoId: string, numero?: number): Promise<{ numero: number; p: Proyecto }> {
  const fila = await db.proyecto.findUniqueOrThrow({ where: { id: proyectoId } });
  const n = numero ?? fila.versionActual;
  const v = await db.version.findUniqueOrThrow({ where: { proyectoId_numero: { proyectoId, numero: n } } });
  return { numero: n, p: validarProyecto(JSON.parse(v.json)) };
}

export async function renderEntregar(
  ctx: Contexto & { etapa: (e: string, progreso: number) => Promise<void>; signal?: AbortSignal },
  proyectoId: string,
  trabajoId: string,
  numeroVersion?: number,
): Promise<ResultadoRender> {
  const t0 = Date.now();
  const fila = await db.proyecto.findUniqueOrThrow({ where: { id: proyectoId } });
  const dir = dirProyecto(fila.slug);
  const { numero, p } = await versionDeProyecto(proyectoId, numeroVersion);
  const plantilla = await obtenerPlantilla(p.plantilla);
  const m = metricas(p.formato);
  const huella = `${await huellaFfmpeg()}|hyperframes@${HYPERFRAMES_VERSION}|${VERSION_COMPILADOR}`;
  const total = duracionEscenas(p) + plantilla.datos.tarjetaFinal.duracion;
  const assetsUsados = [...new Set(p.pistas.flatMap((x) => x.clips.map((c) => c.asset)))];
  const archivosAssets = assetsUsados.map((id) => path.join(dir, p.assets[id]!.ruta));

  // 1. Mezcla de audio.
  await ctx.etapa("Mezclando audio", 0.05);
  const rutaMezcla = path.join(dir, "build", "mezcla.wav");
  const musica = p.pistas.find((x) => x.id === "musica");
  await paso(
    ctx,
    "audio.mezcla",
    {
      archivos: archivosAssets.filter((a) => /\.(mp3|wav|m4a|ogg|flac)$/i.test(a)),
      params: { voz: p.pistas.find((x) => x.id === "voz"), musica: musica ?? null, total, ducking: plantilla.datos.musica.ducking },
      motor: huella,
    },
    [rutaMezcla],
    async ([tmp]) => {
      await mezclar(p, dir, total, plantilla.datos.musica.ducking, tmp!, ctx.log);
      return { total };
    },
  );

  // 2. Compilar a Hyperframes (siempre: es barato y determinista).
  await ctx.etapa("Compilando a Hyperframes", 0.1);
  const comp = compilar(p, plantilla.datos, rutaMezcla, dir);
  const dirBuild = path.join(dir, "build", `hf-${p.formato.replace(":", "x")}`);
  await escribirProyectoHf(dirBuild, comp);
  const indexHtml = path.join(dirBuild, "index.html");
  const fuera = comp.cajas.filter((c) => !c.dentro);
  if (fuera.length) ctx.log(`Aviso: fuera de la banda segura: ${fuera.map((c) => c.nombre).join(", ")}`);

  // 3. hyperframes check.
  await ctx.etapa("hyperframes check", 0.15);
  const rutaCheck = path.join(dir, "build", `check-${p.formato.replace(":", "x")}.json`);
  const { resultado: check } = await paso<ResumenCheck>(
    ctx,
    "hyperframes.check",
    { archivos: [indexHtml, ...Object.values(comp.archivos)], params: { formato: p.formato }, motor: huella },
    [rutaCheck],
    async ([tmp]) => {
      const r = await correr("npx", [...HF, "check", "--json", "--no-cache", "--no-craft"], {
        cwd: dirBuild, env: ENV_HF, permitirFallo: true, signal: ctx.signal, timeout: 15 * 60_000,
      });
      await fs.writeFile(tmp!, r.stdout || "{}");
      let j: { ok?: boolean } = {};
      try {
        j = JSON.parse(r.stdout) as { ok?: boolean };
      } catch {
        /* salida no JSON */
      }
      const acc = { errores: [] as string[], avisos: 0 };
      contarHallazgos(j, acc);
      const res = { ok: j.ok === true, errores: acc.errores.length, avisos: acc.avisos, resumen: acc.errores.slice(0, 5).join("\n") };
      ctx.log(`check: ${res.ok ? "ok" : "con problemas"}, ${res.errores} errores, ${res.avisos} avisos`);
      return res;
    },
  );
  if (check.errores > 0) throw new Error(`hyperframes check encontró ${check.errores} errores:\n${check.resumen}`);

  // 4. Render (NVENC si la GPU está libre; si no, CPU para no esperar).
  await ctx.etapa("Renderizando", 0.2);
  const crudo = path.join(dir, "build", `crudo-${m.perfil}.mp4`);
  let gpu = false;
  const rr = await paso(
    ctx,
    "hyperframes.render",
    { archivos: [indexHtml, ...Object.values(comp.archivos)], params: { calidad: "delivery", fps: 30 }, motor: huella },
    [crudo],
    async ([tmp]) => {
      const candado = await tomarGpu(`render ${fila.slug}`, { esperar: false, signal: ctx.signal });
      gpu = candado !== null;
      ctx.log(gpu ? "GPU libre: render con NVENC (gpu-lock tomado)" : "GPU ocupada: render con CPU (libx264), sin esperar");
      try {
        const args = [...HF, "render", "--output", tmp!, "--quality", "delivery", "--fps", "30", "--quiet"];
        if (gpu) args.push("--gpu");
        else args.push("--no-browser-gpu");
        await correr("npx", args, { cwd: dirBuild, env: ENV_HF, log: ctx.log, signal: ctx.signal, timeout: 60 * 60_000 });
      } finally {
        candado?.liberar();
      }
      return { gpu };
    },
  );
  gpu = rr.resultado.gpu;

  // 5. Sonoridad: loudnorm en dos pasadas sobre el render (el video se copia sin recodificar).
  await ctx.etapa("Normalizando sonoridad", 0.8);
  const base = `v${numero}-${m.perfil}`;
  const final = path.join(dir, "renders", `${base}.mp4`);
  await paso(ctx, "entrega.loudnorm", { archivos: [crudo], params: { lufs: -14, tp: -2 }, motor: huella }, [final], async ([tmp]) => {
    const medido = await normalizarAudio(crudo, tmp!, ctx.log);
    return { antes: medido };
  });

  // 6. QC (mide el archivo entregado).
  await ctx.etapa("Control de calidad", 0.9);
  const momentos = [
    ...escenasEnLinea(p).map((e) => ({ t: e.inicio + e.duracion / 2, nota: `Escena ${e.indice + 1}` })),
    { t: comp.inicioTarjeta + Math.min(1.2, plantilla.datos.tarjetaFinal.duracion - 0.3), nota: "Tarjeta final" },
  ];
  const informe: InformeQc = await correrQc(
    final,
    {
      formato: p.formato,
      total: comp.total,
      inicioTarjeta: comp.inicioTarjeta,
      grupos: comp.grupos,
      cajas: comp.cajas,
      momentos,
      licencias: assetsUsados.map((id) => ({ asset: id, licencia: p.assets[id]!.licencia })),
      check,
    },
    path.join(dir, "renders", `${base}-hoja`),
    ctx.log,
  );
  const rel = (x: string) => path.relative(dir, x);
  const informeRel = { ...informe, archivo: rel(informe.archivo), hojaContacto: informe.hojaContacto && rel(informe.hojaContacto), fotogramas: informe.fotogramas.map((f) => ({ ...f, ruta: rel(f.ruta) })) };
  await fs.writeFile(path.join(dir, "renders", `${base}.qc.json`), JSON.stringify(informeRel, null, 2));
  for (const r of informe.reglas) ctx.log(`QC ${r.ok ? "✓" : r.aviso ? "!" : "✗"} ${r.nombre}: ${JSON.stringify(r.medido).slice(0, 160)}`);

  const segundos = (Date.now() - t0) / 1000;
  const render = await db.render.create({
    data: {
      proyectoId,
      versionNumero: numero,
      perfil: m.perfil,
      ruta: rel(final),
      estado: informe.aprobado ? "aprobado" : "rechazado",
      informeQc: informeRel as object,
      duracion: comp.total,
      segundos,
      trabajoId,
    },
  });
  await db.proyecto.update({ where: { id: proyectoId }, data: { estado: informe.aprobado ? "entregado" : "qc" } });
  ctx.log(`Render ${informe.aprobado ? "APROBADO" : "RECHAZADO por QC"}: ${final} (${segundos.toFixed(1)} s)`);
  return { renderId: render.id, ruta: final, aprobado: informe.aprobado, gpu, segundos };
}
