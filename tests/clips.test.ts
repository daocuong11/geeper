import { describe, expect, it } from "vitest";
import { descripcionClip, mascaraInsultos, reglaClip, terminosProhibidos, type OrigenClip } from "@/lib/clips";
import { compilar, segmentosVisuales } from "@/lib/compilador";
import { aplicarEdicion } from "@/lib/ediciones";
import { pista, validarProyecto, type Proyecto } from "@/lib/esquema";
import { escenasEnLinea, ENTRADA, todosLosGrupos } from "@/lib/linea";
import { usoComercial } from "@/lib/licencias";
import {
  ajustarBordes, chatTwitch, chatYoutube, contarEmocion, elegirVentanas, puntajeFinal, puntuar, suavizar, zscore,
} from "@/lib/momentos";
import { PLANTILLAS_INICIALES } from "@/lib/plantillas";
import { proyectoDePrueba } from "./fixtures";

const plantilla = PLANTILLAS_INICIALES[0]!.datos;
const h = "c".repeat(64);

/** Un clip: un solo asset de video y uno de voz de la misma grabación, con 1 s de margen. */
function clip(): Proyecto {
  const p = proyectoDePrueba();
  p.assets = {
    "voz-tramo": { id: "voz-tramo", tipo: "audio", ruta: "assets/voz-tramo.wav", hash: h, source: "archivo", licencia: "revisar: x", duracion: 11, regenerar: { origen: "clip" } },
    tramo: { id: "tramo", tipo: "video", ruta: "assets/tramo.mp4", hash: h, source: "archivo", licencia: "revisar: x", duracion: 11, ancho: 1920, alto: 1080, regenerar: { origen: "clip" } },
  };
  for (const [i, c] of pista(p, "voz").clips.entries()) {
    c.asset = "voz-tramo";
    c.rango = { inicio: 1 + i * 3, duracion: 3 };
  }
  for (const [i, c] of pista(p, "visual").clips.entries()) {
    c.asset = "tramo";
    c.rango = { inicio: 1 + i * 3, duracion: 3 };
    c.sincro = "voz";
  }
  for (const e of Object.values(p.escenas)) e.palabras = e.palabras.map((w) => ({ ...w, inicio: w.inicio + 1, fin: w.fin + 1 }));
  return validarProyecto(p);
}

describe("visual en sincro con la voz", () => {
  it("sin recortes: un tramo por escena, en el mismo punto de la grabación que la voz", () => {
    const p = clip();
    const es = escenasEnLinea(p);
    const s = segmentosVisuales(es[1]!, p.assets.tramo!, 1, 0);
    expect(s).toEqual([{ t: 0, dur: 3, desde: 4 }]);
  });

  it("la primera escena cubre la entrada con la imagen que precede a la voz", () => {
    const p = clip();
    const e0 = escenasEnLinea(p)[0]!;
    const [s] = segmentosVisuales(e0, p.assets.tramo!, 1, ENTRADA);
    expect(s!.t).toBeCloseTo(-ENTRADA);
    expect(s!.desde).toBeCloseTo(1 - ENTRADA);
    expect(s!.dur).toBeCloseTo(3 + ENTRADA);
  });

  it("recortar palabras corta también la imagen: cada tramo sigue a su voz", () => {
    // e02 suena 4–7 s del asset; recortar «dice GTA» (5,0–5,9) deja dos tramos.
    const p = aplicarEdicion(clip(), { tipo: "recortarPalabras", escena: "e02", desde: 2, hasta: 4 });
    const e = escenasEnLinea(p)[1]!;
    const s = segmentosVisuales(e, p.assets.tramo!, 1, 0);
    expect(s.length).toBe(2);
    for (const [k, seg] of s.entries()) {
      const tr = e.tramos[k]!;
      expect(seg.desde).toBeCloseTo(tr.inicio); // visual y voz: mismo tiempo de asset
      expect(seg.t).toBeCloseTo(tr.enEscena);
      expect(seg.dur).toBeCloseTo(tr.fin - tr.inicio);
    }
    expect(s.reduce((x, y) => x + y.dur, 0)).toBeCloseTo(e.duracion);
  });

  it("ignora la velocidad y compila sin data-playback-rate", () => {
    const p = clip();
    pista(p, "visual").clips[0]!.velocidad = 2;
    const c = compilar(validarProyecto(p), plantilla, "/tmp/m.wav", "/tmp/p");
    expect(c.html).toContain('data-media-start="0.700"'); // 1 s menos la entrada de 0,3 s
    expect(c.html).toContain('data-media-start="4.000"');
    expect(c.html).not.toMatch(/id="v-e01-0"[^>]*playback/);
  });

  it("sin sincro, el comportamiento de siempre (corre seguido desde el inicio del rango)", () => {
    const p = proyectoDePrueba();
    const e = escenasEnLinea(p)[0]!;
    expect(segmentosVisuales(e, p.assets["clip-01"]!, 1, 0)).toEqual([{ t: 0, dur: 3, desde: 0 }]);
  });

  it("reemplazar el visual por un archivo propio quita la sincro", async () => {
    const { reemplazarVisual } = await import("@/lib/ediciones");
    const a = { id: "propio", tipo: "video" as const, ruta: "assets/propio.mp4", hash: h, source: "archivo" as const, licencia: "propia", duracion: 5, regenerar: {} };
    const p = reemplazarVisual(clip(), "e01", a);
    expect(pista(p, "visual").clips[0]!.sincro).toBeUndefined();
  });
});

describe("puntaje de momentos", () => {
  it("zscore y suavizado", () => {
    expect(zscore([1, 1, 1])).toEqual([0, 0, 0]);
    const z = zscore([0, 0, 0, 10]);
    expect(z[3]).toBeGreaterThan(1);
    expect(suavizar([0, 3, 0], 3)).toEqual([1, 1, 1]);
  });

  it("encuentra el salto de sonoridad y pone el pico al 55 % de la ventana", () => {
    const db = Array.from({ length: 300 }, () => -30);
    for (let t = 150; t < 154; t++) db[t] = -5;
    const c = elegirVentanas(puntuar({ db }), 300, { top: 3, min: 15, max: 40 });
    expect(c.length).toBeGreaterThan(0);
    const mejor = c.find((x) => x.pico >= 149 && x.pico <= 155)!;
    expect(mejor).toBeTruthy();
    expect(mejor.inicio).toBeCloseTo(mejor.pico - 22, 0);
    expect(mejor.motivos).toContain("pico de sonoridad");
    // sin solapes
    const orden = [...c].sort((a, b) => a.inicio - b.inicio);
    for (let i = 1; i < orden.length; i++) expect(orden[i]!.inicio).toBeGreaterThanOrEqual(orden[i - 1]!.fin - 1);
  });

  it("«lo más visto» y el chat pesan más que la sonoridad", () => {
    const db = Array.from({ length: 200 }, (_, i) => -30 + (i === 30 ? 10 : 0));
    const heatmap = [{ start_time: 120, end_time: 130, value: 1 }];
    const c = elegirVentanas(puntuar({ db, heatmap }), 200, { top: 1, min: 15, max: 40 });
    expect(c[0]!.pico).toBeGreaterThanOrEqual(120);
    expect(c[0]!.motivos.join()).toMatch(/lo más visto/);
  });

  it("material más corto que un clip: sin candidatos", () => {
    expect(elegirVentanas(puntuar({ db: [-30, -5, -30] }), 3, { top: 3, min: 15, max: 40 })).toEqual([]);
  });

  it("bordes a frase", () => {
    const w = (texto: string, inicio: number) => ({ texto, inicio, fin: inicio + 0.4 });
    const palabras = [w("antes.", 9), w("Mira", 10.2), w("eso", 11), ...Array.from({ length: 30 }, (_, i) => w("bla", 12 + i)), w("final.", 43), w("otra", 44.5)];
    const b = ajustarBordes({ inicio: 10.5, fin: 45 }, palabras, { min: 15, max: 40 }, 100);
    expect(b.inicio).toBeCloseTo(10.0);
    expect(b.fin).toBeCloseTo(43.7);
  });

  it("emoción en inglés y español suma, con tope", () => {
    const ps = "no way bro qué locura mira".split(" ").map((t, i) => ({ texto: t, inicio: i, fin: i + 0.5 }));
    expect(contarEmocion(ps)).toBe(4);
    expect(puntajeFinal({ n: 1, inicio: 0, fin: 1, pico: 0, puntaje: 1, motivos: [], emocion: 10 })).toBe(3);
  });

  it("chat de YouTube y de TwitchDownloader", () => {
    const yt = [
      JSON.stringify({ replayChatItemAction: { videoOffsetTimeMsec: "2500", actions: [{ t: "LOL" }] } }),
      JSON.stringify({ replayChatItemAction: { videoOffsetTimeMsec: "2900", actions: [{ t: "hola" }] } }),
      "roto",
    ].join("\n");
    expect(chatYoutube(yt, 5)).toEqual([0, 0, 3, 0, 0]);
    expect(chatTwitch({ comments: [{ content_offset_seconds: 1.2, message: { body: "KEKW" } }, { content_offset_seconds: 9 }] }, 3)).toEqual([0, 2, 0]);
  });
});

describe("reglas de clips", () => {
  const origen: OrigenClip = {
    fuente: "abc", url: "https://youtu.be/x", titulo: "VOD", canal: "Kai", plataforma: "Youtube", inicio: 10, fin: 40,
    encuadre: "react", credito: "Créditos: Kai (https://youtu.be/x)",
  };

  it("detecta términos prohibidos y «oficial», sin falsos positivos por subcadenas", () => {
    expect(terminosProhibidos("GTA 6 leak gameplay")).toContain("leak");
    expect(terminosProhibidos("Tráiler OFICIAL")).toContain("oficial");
    expect(terminosProhibidos("Cómo jugar antes que nadie: jugar antes")).toContain("jugar antes");
    expect(terminosProhibidos("Kai pierde la cabeza con la policía")).toEqual([]);
    expect(terminosProhibidos("cracked aim")).toEqual([]);
  });

  it("la regla de QC pide crédito, títulos limpios y la duración de la campaña", () => {
    const p = { nombre: "Kai pierde la cabeza", textos: [], origen: { clip: origen } };
    expect(reglaClip(p, 30)!.ok).toBe(true);
    expect(reglaClip({ ...p, textos: [{ id: "t", texto: "GTA 6 free download", inicio: 0, duracion: 2, estilo: "titulo" as const, posicion: "arriba" as const }] }, 30)!.ok).toBe(false);
    expect(reglaClip({ ...p, origen: { clip: { ...origen, credito: "" } } }, 30)!.detalle).toMatch(/crédito/);
    const conCampania = { ...p, origen: { clip: { ...origen, campania: { maxSegundos: 20, hashtags: ["#gta6"], mencion: "@kai" } } } };
    expect(reglaClip(conCampania, 30)!.ok).toBe(false);
    expect(descripcionClip(conCampania.origen.clip)).toBe("Créditos: Kai (https://youtu.be/x)\n@kai\n#gta6");
    expect(reglaClip({ nombre: "x", textos: [], origen: {} }, 30)).toBeNull();
  });

  it("enmascara insultos en los subtítulos sin tocar el audio", () => {
    const p = clip();
    p.escenas.e01!.palabras[2]!.texto = "Retard";
    p.mostrar = [...p.mostrar, ...mascaraInsultos()];
    const textos = todosLosGrupos(validarProyecto(p)).map((g) => g.texto).join(" ");
    expect(textos).toContain("r*****");
    expect(textos).not.toMatch(/retard/i);
  });

  it("licencias: sin permiso queda «revisar», con permiso del creador es comercial", () => {
    expect(usoComercial("revisar: material de Kai (https://youtu.be/x); publica sólo con su permiso")).toBe("desconocido");
    expect(usoComercial("permiso del creador: campaña de Kai en Whop")).toBe("si");
  });
});

describe("radar de tendencias y contraste del título", () => {
  it("ordena por vistas por hora, descarta en vivo, viejos y sin fecha", async () => {
    const { ordenar } = await import("@/lib/tendencias");
    const ahora = 1_000_000;
    const r = ordenar([
      { webpage_url: "a", title: "A", view_count: 1000, timestamp: ahora - 10 * 3600 },
      { webpage_url: "b", title: "B", view_count: 900, timestamp: ahora - 3600, heatmap: [{}] },
      { webpage_url: "c", title: "en vivo", view_count: 9e6, timestamp: ahora - 3600, is_live: true },
      { webpage_url: "d", title: "viejo", view_count: 9e6, timestamp: ahora - 48 * 3600 },
      { webpage_url: "e", title: "sin fecha", view_count: 9e6 },
    ], ahora, 24);
    expect(r.map((x) => x.url)).toEqual(["b", "a"]);
    expect(r[0]!.vistasPorHora).toBe(900);
    expect(r[0]!.loMasVisto).toBe(true);
  });

  it("el título usa una tinta legible sobre el degradado de la plantilla", async () => {
    const { contraste, tintaSobre } = await import("@/lib/compilador");
    for (const pl of PLANTILLAS_INICIALES) {
      const c = pl.datos.colores;
      const t = tintaSobre(c.tinta, [c.acento1, c.acento2]);
      expect(Math.min(contraste(t, c.acento1)!, contraste(t, c.acento2)!)).toBeGreaterThanOrEqual(4.5);
    }
    expect(tintaSobre("#ffffff", ["#000000"])).toBe("#ffffff");
  });
});
