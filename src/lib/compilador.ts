/**
 * Compilador geeper.json → proyecto Hyperframes (index.html + assets enlazados).
 *
 * Es `construir_html()` de mpt_acabado.py generalizado: marca arriba dentro de la banda segura,
 * golpe de zoom en cada corte, subtítulos karaoke con la palabra activa resaltada, tarjeta final; ahora
 * con escenas editables, plantilla de datos, tres formatos y comprobación de zonas seguras.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pista, type Asset, type Clip, type Proyecto } from "./esquema";
import { ANCHO_CARACTER, dentro, metricas, PADDING_PASTILLA, type Caja } from "./formatos";
import { duracionEscenas, escenasEnLinea, intervalos, todosLosGrupos, type Grupo } from "./linea";
import type { DatosPlantilla } from "./plantillas";
import { lineas } from "./subtitulos";

export const VERSION_COMPILADOR = "compilador-hf-v1";

export interface CajaRevisada {
  nombre: string;
  caja: Caja;
  dentro: boolean;
}

export interface Compilado {
  html: string;
  total: number;
  inicioTarjeta: number;
  grupos: Grupo[];
  cajas: CajaRevisada[];
  /** Archivos que el proyecto Hyperframes necesita: ruta dentro de build → ruta absoluta de origen. */
  archivos: Record<string, string>;
  ancho: number;
  alto: number;
}

const e = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const jsonScript = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
const f3 = (n: number) => n.toFixed(3);

interface Pieza {
  id: string;
  src: string;
  inicio: number;
  dur: number;
  desde: number;
  clase: string;
  imagen: boolean;
}

/** Decide cubrir/contener: automático si la relación de aspecto difiere mucho del lienzo. */
function ajusteDe(c: Clip, a: Asset, W: number, H: number): "cubrir" | "contener" {
  if (c.ajuste) return c.ajuste;
  if (!a.ancho || !a.alto) return "cubrir";
  const r = a.ancho / a.alto / (W / H);
  return Math.max(r, 1 / r) > 1.4 ? "contener" : "cubrir";
}

export function compilar(p: Proyecto, plantilla: DatosPlantilla, rutaMezcla: string, dirProyecto: string): Compilado {
  const m = metricas(p.formato);
  const { W, H } = m;
  const vertical = H > W;
  const escenas = escenasEnLinea(p);
  const inicioTarjeta = duracionEscenas(p);
  const total = inicioTarjeta + plantilla.tarjetaFinal.duracion;
  const grupos = todosLosGrupos(p);
  const archivos: Record<string, string> = { "assets/mezcla.wav": rutaMezcla };

  // ---- Visuales: un tramo por escena; si el clip es más corto que la escena, se repite.
  const piezas: Pieza[] = [];
  const cortes: { t: number; ids: string[] }[] = [];
  for (const es of escenas) {
    const a = p.assets[es.visual.asset]!;
    const nombre = `assets/${a.id}${path.extname(a.ruta)}`;
    archivos[nombre] = path.join(dirProyecto, a.ruta);
    const ajuste = ajusteDe(es.visual, a, W, H);
    const ids: string[] = [];
    const imagen = a.tipo === "imagen";
    // La primera escena también cubre la entrada en silencio del principio.
    const entrada = es.indice === 0 ? es.inicio : 0;
    let t = -entrada;
    let desde = es.visual.rango.inicio;
    let k = 0;
    while (t < es.duracion - 1e-3 && k < 50) {
      const disponible = imagen || !a.duracion ? es.duracion - t : a.duracion - desde;
      if (disponible < 0.05) {
        desde = 0;
        k++;
        continue;
      }
      const dur = Math.min(es.duracion - t, disponible);
      const base = `${es.escena.id}-${k}`;
      if (ajuste === "contener") {
        piezas.push({ id: `b-${base}`, src: nombre, inicio: es.inicio + t, dur, desde, clase: "fondo desenfoque", imagen });
        piezas.push({ id: `v-${base}`, src: nombre, inicio: es.inicio + t, dur, desde, clase: "fondo contener", imagen });
      } else {
        piezas.push({ id: `v-${base}`, src: nombre, inicio: es.inicio + t, dur, desde, clase: `fondo ancla-${es.visual.ancla ?? "centro"}`, imagen });
      }
      if (k === 0) ids.push(`v-${base}`);
      t += dur;
      desde = 0;
      k++;
    }
    cortes.push({ t: es.inicio - entrada, ids });
  }
  // La última escena se congela bajo la tarjeta final: se extiende el último tramo.
  const ultimas = piezas.filter((x) => Math.abs(x.inicio + x.dur - inicioTarjeta) < 1e-3);
  for (const u of ultimas) u.dur += plantilla.tarjetaFinal.duracion;

  const videos = piezas
    .map((x) =>
      x.imagen
        ? `      <img id="${x.id}" class="clip ${x.clase}" src="${e(x.src)}" data-start="${f3(x.inicio)}" data-duration="${f3(x.dur)}" data-track-index="0" alt="" />`
        : `      <video id="${x.id}" class="clip ${x.clase}" src="${e(x.src)}" data-start="${f3(x.inicio)}" data-duration="${f3(x.dur)}" data-media-start="${f3(x.desde)}" data-track-index="0" muted playsinline></video>`,
    )
    .join("\n");

  // ---- Subtítulos.
  const gruposHtml = grupos
    .map((g, gi) => {
      const spans = g.fichas.map((f, wi) => `<span id="w${gi}-${wi}" class="palabra">${e(f.texto)}</span>`).join(" ");
      return `        <div id="g${gi}" class="grupo"><div class="pastilla">${spans}</div></div>`;
    })
    .join("\n");
  const iv = intervalos(grupos, inicioTarjeta);
  const tiempos = grupos.map((g, gi) => ({
    id: `g${gi}`,
    ini: iv[gi]!.ini,
    fin: iv[gi]!.fin,
    words: g.fichas.map((f, wi) => ({ id: `w${gi}-${wi}`, start: f.inicio, end: f.fin })),
  }));

  // ---- Marca (logo opcional).
  let logoHtml = "";
  if (plantilla.marca.logo) {
    const nombre = `assets/logo${path.extname(plantilla.marca.logo)}`;
    archivos[nombre] = plantilla.marca.logo;
    logoHtml = `<img class="logo" src="${e(nombre)}" alt="" />`;
  }

  // ---- Zonas seguras: cajas de cada elemento contra la banda segura del formato.
  const anchoTexto = (txt: string, fs: number) => txt.length * fs * ANCHO_CARACTER;
  const chipW = anchoTexto(plantilla.marca.texto, m.marcaFs) * 1.06 + 68 + (logoHtml ? m.marcaFs * 1.4 : 0);
  const chipH = m.marcaFs * 1.15 + 30;
  const tituloCpl = Math.max(4, Math.floor((W - 120) / (m.tituloFs * ANCHO_CARACTER)));
  const tituloLineas = lineas(plantilla.tarjetaFinal.titulo.toUpperCase(), tituloCpl);
  const tituloW = Math.min(W - 120, Math.max(...tituloLineas.map((l) => anchoTexto(l, m.tituloFs))));
  const ctaW = anchoTexto(plantilla.cta, m.ctaFs) + 80;
  const cierreH = tituloLineas.length * m.tituloFs + 28 + m.ctaFs * 1.2 + 32;
  const cajasBase: { nombre: string; caja: Caja }[] = [
    { nombre: "marca", caja: { x: (W - chipW) / 2, y: m.marcaTop, w: chipW, h: chipH } },
    { nombre: "subtítulos", caja: m.subs },
    { nombre: "tarjeta final: título", caja: { x: (W - tituloW) / 2, y: (H - cierreH) / 2, w: tituloW, h: tituloLineas.length * m.tituloFs } },
    { nombre: "tarjeta final: CTA", caja: { x: (W - ctaW) / 2, y: (H + cierreH) / 2 - (m.ctaFs * 1.2 + 32), w: ctaW, h: m.ctaFs * 1.2 + 32 } },
  ];
  const cajas = cajasBase.map((c) => ({ ...c, dentro: dentro(c.caja, m.segura) }));

  const c = plantilla.colores;
  const t = plantilla.tipografia;
  const fuenteTitulos = `"${t.titulos}", "${t.texto}", sans-serif`;
  const fuenteTexto = `"${t.texto}", sans-serif`;
  const html = `<!doctype html>
<html lang="es" data-resolution="${vertical ? "portrait" : W === H ? "square" : "landscape"}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <!-- Generado por Geeper (${VERSION_COMPILADOR}) desde geeper.json: no editar a mano. -->
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      :root {
        --tinta: ${c.tinta};
        --activa: ${c.activa};
        --acento1: ${c.acento1};
        --acento2: ${c.acento2};
        --fondo-pastilla: ${c.fondoPastilla};
        --fondo-cierre: ${c.fondoCierre};
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; font-family: ${fuenteTitulos}; }
      .fondo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
      .fondo.contener { object-fit: contain; z-index: 2; }
      .fondo.desenfoque { filter: blur(40px) brightness(0.55); transform: scale(1.15); z-index: 1; }
      .ancla-arriba { object-position: 50% 0%; }
      .ancla-abajo { object-position: 50% 100%; }
      #marca { position: absolute; top: ${m.marcaTop}px; left: 0; width: 100%; z-index: 30; display: flex; justify-content: center; }
      #marca .chip { display: flex; align-items: center; gap: 14px; padding: 14px 34px 16px; border-radius: 999px;
                     background: rgba(0,0,0,0.5); border: 2px solid rgba(255,255,255,0.18); }
      #marca .logo { height: ${Math.round(m.marcaFs * 1.2)}px; width: auto; }
      #marca .txt { font-size: ${m.marcaFs}px; letter-spacing: 0.06em; text-transform: uppercase;
                    background: linear-gradient(90deg, var(--acento1), var(--acento2));
                    -webkit-background-clip: text; background-clip: text; color: transparent; }
      #subtitulos { position: absolute; left: ${m.subs.x}px; top: ${m.subs.y}px; width: ${m.subs.w}px; height: ${m.subs.h}px; z-index: 40; overflow: visible; }
      .grupo { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; overflow: visible; }
      .pastilla { max-width: ${m.pastillaMax}px; padding: 18px ${PADDING_PASTILLA}px 22px; border-radius: 26px; background: var(--fondo-pastilla);
                  text-align: center; line-height: 1.12; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px ${Math.round(m.subsFs * 0.42)}px; overflow: visible; }
      .palabra { display: inline-block; font-family: ${fuenteTitulos}; font-size: ${m.subsFs}px; color: var(--tinta); text-shadow: 0 4px 14px rgba(0,0,0,0.65); }
      #cierre { position: absolute; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center;
                gap: 28px; background: var(--fondo-cierre); }
      #cierre .titulo { font-size: ${m.tituloFs}px; text-transform: uppercase; text-align: center; line-height: 1.0; padding: 0 60px;
                        background: linear-gradient(90deg, var(--acento1), var(--acento2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
      #cierre .cta { font-family: ${fuenteTexto}; font-weight: ${t.pesoTexto}; font-size: ${m.ctaFs}px; color: var(--tinta);
                     padding: 16px 40px; border-radius: 999px; background: var(--acento1); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${f3(total)}" data-width="${W}" data-height="${H}">
${videos}
      <audio id="mezcla" class="clip" src="assets/mezcla.wav" data-start="0" data-duration="${f3(total)}" data-track-index="1"></audio>
      <div id="marca" class="clip" data-start="0" data-duration="${f3(inicioTarjeta)}" data-track-index="2">
        <div class="chip">${logoHtml}<span class="txt">${e(plantilla.marca.texto)}</span></div>
      </div>
      <div id="subtitulos" class="clip" data-start="0" data-duration="${f3(inicioTarjeta)}" data-track-index="3" data-track-kind="captions">
${gruposHtml}
      </div>
      <div id="cierre" class="clip" data-start="${f3(inicioTarjeta)}" data-duration="${f3(total - inicioTarjeta)}" data-track-index="4">
        <div class="titulo">${e(plantilla.tarjetaFinal.titulo)}</div>
        <div class="cta">${e(plantilla.cta)}</div>
      </div>
    </div>
    <script>
      const GRUPOS = ${jsonScript(tiempos)};
      const CORTES = ${jsonScript(cortes)};
      const FIN_SUBS = ${f3(inicioTarjeta)};
      const ACTIVA = ${jsonScript(c.activa)};
      const TINTA = ${jsonScript(c.tinta)};
      const tl = gsap.timeline({ paused: true });
      // Golpe de zoom en cada corte de escena.
      CORTES.forEach((c) => {
        c.ids.forEach((id) => tl.fromTo("#" + id, { scale: 1.07 }, { scale: 1, duration: 0.4, ease: "power3.out" }, c.t));
      });
      tl.from("#marca .chip", { y: -30, opacity: 0, duration: 0.45, ease: "back.out(1.6)" }, 0.15);
      // Karaoke: un grupo visible a la vez; la palabra que suena se enciende.
      GRUPOS.forEach((g) => {
        const ini = g.ini;
        const fin = g.fin;
        const el = "#" + g.id;
        tl.set(el, { visibility: "visible" }, ini);
        tl.fromTo(el, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.1, ease: "power2.out" }, ini);
        g.words.forEach((w) => {
          const s = Math.max(ini, w.start - 0.03);
          tl.to("#" + w.id, { color: ACTIVA, scale: 1.05, duration: 0.07, ease: "power2.out" }, s);
          tl.to("#" + w.id, { color: TINTA, scale: 1, duration: 0.08, ease: "power2.in" }, Math.max(s + 0.08, w.end));
        });
        tl.to(el, { opacity: 0, duration: 0.08, ease: "power2.in" }, Math.max(ini + 0.12, fin - 0.08));
        tl.set(el, { opacity: 0, visibility: "hidden" }, Math.max(ini + 0.2, fin));
      });
      tl.from("#cierre", { opacity: 0, duration: 0.3, ease: "power2.out" }, FIN_SUBS);
      tl.from("#cierre .titulo", { scale: 0.82, opacity: 0, duration: 0.45, ease: "back.out(1.8)" }, FIN_SUBS + 0.1);
      tl.from("#cierre .cta", { y: 40, opacity: 0, duration: 0.35, ease: "power3.out" }, FIN_SUBS + 0.35);
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
  return { html, total, inicioTarjeta, grupos, cajas, archivos, ancho: W, alto: H };
}

/** Escribe el proyecto Hyperframes en `dirBuild` (enlaces duros a los assets: no ocupa espacio). */
export async function escribirProyectoHf(dirBuild: string, comp: Compilado): Promise<void> {
  await fs.rm(dirBuild, { recursive: true, force: true });
  await fs.mkdir(path.join(dirBuild, "assets"), { recursive: true });
  for (const [rel, abs] of Object.entries(comp.archivos)) {
    const destino = path.join(dirBuild, rel);
    try {
      await fs.link(abs, destino);
    } catch {
      await fs.copyFile(abs, destino);
    }
  }
  await fs.writeFile(path.join(dirBuild, "index.html"), comp.html);
  await fs.writeFile(
    path.join(dirBuild, "hyperframes.json"),
    JSON.stringify(
      {
        $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
        paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
        media: { autoProxy: true },
      },
      null,
      2,
    ),
  );
}

export function pistaMusica(p: Proyecto): Clip | undefined {
  return p.pistas.find((x) => x.id === "musica")?.clips[0];
}

export { pista };
