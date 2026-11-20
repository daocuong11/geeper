import { describe, expect, it } from "vitest";
import { compilar } from "@/lib/compilador";
import { leerSilencios, parecido, puntuarPalabras, resumirConfianza } from "@/lib/confianza";
import { aplicarEdicion, Edicion } from "@/lib/ediciones";
import { pista, validarProyecto, type Proyecto } from "@/lib/esquema";
import { dentro, metricas, zonaPlataforma } from "@/lib/formatos";
import { usoComercial } from "@/lib/licencias";
import { duracionEscenas, escenasEnLinea, todosLosGrupos } from "@/lib/linea";
import { planMezcla } from "@/lib/mezcla";
import { aOtio } from "@/lib/otio";
import { PLANTILLAS_INICIALES } from "@/lib/plantillas";
import { medirRitmo, mejorInicio, pulsosEnLinea } from "@/lib/pulsos";
import { reglaAlineacion, reglaLicencias, reglaRitmo, revisarSubtitulos } from "@/lib/qc";
import { textoADecir } from "@/lib/regenerar";
import { proyectoDePrueba } from "./fixtures";

const plantilla = PLANTILLAS_INICIALES[0]!.datos;
const h = "b".repeat(64);
const ed = (p: Proyecto, ...eds: Edicion[]) => eds.reduce((x, e) => aplicarEdicion(x, e), p);
/** Como la ruta /editar: valida la edición y le pone sus valores por defecto. */
const parse = (e: Record<string, unknown>) => Edicion.parse(e);

/** Proyecto de prueba con una muletilla y una pausa larga en la escena 2. */
function conPausas(): Proyecto {
  const p = proyectoDePrueba();
  const e = p.escenas.e02!;
  // e02: voz 3–6 s. «Escena 2 eh … dice GTA seis.» con una pausa de 1 s antes de «dice».
  e.palabras = [
    { texto: "Escena", inicio: 3.0, fin: 3.3 },
    { texto: "2", inicio: 3.3, fin: 3.5 },
    { texto: "eh,", inicio: 3.55, fin: 3.75 },
    { texto: "dice", inicio: 4.75, fin: 5.0 },
    { texto: "GTA", inicio: 5.0, fin: 5.3 },
    { texto: "seis.", inicio: 5.3, fin: 5.7 },
  ];
  e.texto = e.palabras.map((w) => w.texto).join(" ");
  return validarProyecto(p);
}

describe("esquema v2", () => {
  it("migra un geeper.json v1 sin perder nada y con los campos nuevos por defecto", () => {
    const p = proyectoDePrueba(); // el fixture se escribe como v1
    expect(p.schemaVersion).toBe(2);
    expect(p.textos).toEqual([]);
    expect(p.comercial).toBe(false);
    expect(p.plataformas).toEqual([]);
    expect(p.entrega).toEqual({ master: false });
    expect(Object.values(p.escenas).every((e) => Array.isArray(e.recortes))).toBe(true);
    // Volver a validar la salida es idempotente.
    expect(validarProyecto(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it("una pista libre necesita inicio y no puede usar un nombre reservado con otro tipo", () => {
    const p = proyectoDePrueba();
    const malo = structuredClone(p) as unknown as { pistas: { id: string; tipo: string; clips: unknown[] }[] };
    malo.pistas.push({ id: "broll", tipo: "video", clips: [{ id: "b1", asset: "clip-01", rango: { inicio: 0, duracion: 2 } }] });
    expect(() => validarProyecto(malo)).toThrow(/no dice dónde empieza/);
    const otro = structuredClone(p) as unknown as { pistas: { id: string; tipo: string }[] };
    otro.pistas[0]!.tipo = "audio";
    expect(() => validarProyecto(otro)).toThrow();
  });
});

describe("edición por texto", () => {
  it("recortar palabras acorta la escena, quita su subtítulo y corre lo que sigue", () => {
    const p = proyectoDePrueba();
    const antes = duracionEscenas(p);
    const q = ed(p, { tipo: "recortarPalabras", escena: "e01", desde: 2, hasta: 3 }); // «dice»
    const e1 = escenasEnLinea(q)[0]!;
    expect(e1.tramos).toHaveLength(2);
    // El corte va de la mitad del silencio anterior a la mitad del siguiente: 0,5 s menos.
    expect(antes - duracionEscenas(q)).toBeCloseTo(0.5, 3);
    const textos = todosLosGrupos(q).filter((g) => g.escena === "e01").map((g) => g.texto).join(" ");
    expect(textos).not.toMatch(/\bdice\b/);
    expect(textos).toContain("GTA VI.");
    // La escena 2 empieza 0,5 s antes.
    expect(escenasEnLinea(q)[1]!.inicio).toBeCloseTo(escenasEnLinea(p)[1]!.inicio - 0.5, 3);
    // La mezcla arma la voz por tramos.
    const plan = planMezcla(q, "/d", duracionEscenas(q) + 2, true);
    expect(plan.filtro).toContain("[s0t1]");
    expect(plan.filtro.match(/atrim=start/g)!.length).toBe(4);
    // Restaurar lo deja igual que antes.
    const r = ed(q, { tipo: "restaurarPalabras", escena: "e01", desde: 2, hasta: 3 });
    expect(duracionEscenas(r)).toBeCloseTo(antes, 6);
  });

  it("«Suena bien» confirma las palabras escuchadas y sólo esas", () => {
    const p = proyectoDePrueba();
    p.escenas.e01!.palabras = p.escenas.e01!.palabras.map((w) => ({ ...w, confianza: 0.3 }));
    const q = ed(p, { tipo: "confirmarPalabras", escena: "e01", desde: 1, hasta: 3 });
    expect(q.escenas.e01!.palabras.map((w) => w.confianza)).toEqual([0.3, 1, 1, 0.3, 0.3]);
    expect(p.escenas.e01!.palabras[1]!.confianza).toBe(0.3); // no muta el original
    expect(() => ed(p, { tipo: "confirmarPalabras", escena: "e01", desde: 2, hasta: 9 })).toThrow(/inválido/);
  });

  it("no deja recortar una escena entera", () => {
    expect(() => ed(proyectoDePrueba(), { tipo: "recortarPalabras", escena: "e01", desde: 0, hasta: 5 })).toThrow(/vacía/);
  });

  it("acorta silencios largos y quita muletillas", () => {
    const p = conPausas();
    const sil = ed(p, parse({ tipo: "quitarSilencios", escena: "e02", umbral: 0.6, dejar: 0.25 }));
    const r = sil.escenas.e02!.recortes;
    expect(r).toHaveLength(1);
    expect(r[0]!.motivo).toBe("silencio");
    expect(r[0]!.inicio).toBeCloseTo(3.75 + 0.125, 3);
    expect(r[0]!.fin).toBeCloseTo(4.75 - 0.125, 3);
    expect(duracionEscenas(p) - duracionEscenas(sil)).toBeCloseTo(0.75, 3);
    // Volver a aplicarlo no duplica recortes.
    expect(ed(sil, parse({ tipo: "quitarSilencios", escena: "e02", umbral: 0.6, dejar: 0.25 })).escenas.e02!.recortes).toHaveLength(1);

    const mul = ed(p, { tipo: "quitarMuletillas" });
    const rm = mul.escenas.e02!.recortes;
    expect(rm).toHaveLength(1);
    expect(rm[0]!.motivo).toBe("muletilla");
    expect(todosLosGrupos(mul).map((g) => g.texto).join(" ")).not.toContain("eh,");
    // Lo que diría una voz regenerada ya no lleva la muletilla.
    expect(textoADecir(mul.escenas.e02!)).toBe("Escena 2 dice GTA seis.");
    expect(ed(mul, { tipo: "quitarRecortes" }).escenas.e02!.recortes).toEqual([]);
  });
});

describe("efectos, textos y pistas libres", () => {
  it("compila transición, movimiento, velocidad y color del plano", () => {
    const p = ed(proyectoDePrueba(), {
      tipo: "efectosVisual", escena: "e02",
      transicion: { tipo: "fundido", duracion: 0.5 },
      movimiento: { desde: { escala: 1, x: 0, y: 0 }, hasta: { escala: 1.2, x: 0.1, y: 0 } },
      velocidad: 1.5,
      color: { brillo: 1.1, contraste: 1, saturacion: 0 },
    });
    const c = compilar(p, plantilla, "/tmp/m.wav", "/tmp/p");
    expect(c.html).toContain('data-playback-rate="1.5"');
    expect(c.html).toContain("saturate(0)");
    expect(c.html).toMatch(/"id":"v-e02-0","t":[\d.]+,"dur":0\.5,"desde":\{"opacity":0\}/);
    // La escena anterior se alarga lo que dura el fundido (queda debajo).
    const e1 = escenasEnLinea(p)[0]!;
    const fin1 = (e1.inicio + e1.duracion + 0.5).toFixed(3);
    const m = /id="v-e01-0"[^>]*data-start="([\d.]+)" data-duration="([\d.]+)"/.exec(c.html)!;
    expect((Number(m[1]) + Number(m[2])).toFixed(3)).toBe(fin1);
    // Con transición propia, esa escena no lleva el golpe de zoom de la plantilla.
    expect(c.html).not.toMatch(/"ids":\["v-e02-0"\]/);
  });

  it("los textos superpuestos se pintan y se revisan contra la banda segura", () => {
    const p = ed(proyectoDePrueba(), parse({ tipo: "agregarTexto", texto: { texto: "Dato curioso", inicio: 1, duracion: 2, estilo: "titulo", posicion: "arriba" } }));
    expect(p.textos[0]!.id).toBe("texto-1");
    const c = compilar(p, plantilla, "/tmp/m.wav", "/tmp/p");
    expect(c.html).toContain('id="t-texto-1"');
    const caja = c.cajas.find((x) => x.nombre.startsWith("texto"))!;
    expect(caja.dentro).toBe(true);
    const sin = ed(p, { tipo: "quitarTexto", id: "texto-1" });
    expect(sin.textos).toEqual([]);
  });

  it("agrega superposiciones de video y efectos de sonido en su momento", () => {
    const base = proyectoDePrueba();
    base.assets.whoosh = { id: "whoosh", tipo: "audio", ruta: "assets/whoosh.wav", hash: h, source: "archivo", licencia: "CC0", duracion: 0.8, regenerar: {} };
    const p = ed(
      validarProyecto(base),
      parse({ tipo: "agregarClipLibre", pista: "broll", asset: "clip-02", inicio: 2, duracion: 1.5 }),
      parse({ tipo: "agregarClipLibre", pista: "efectos", asset: "whoosh", inicio: 3.3, volumen: 0.8 }),
    );
    expect(p.pistas.map((x) => x.id)).toEqual(["visual", "voz", "broll", "efectos"]);
    const c = compilar(p, plantilla, "/tmp/m.wav", "/tmp/p");
    expect(c.html).toMatch(/id="s-broll-0" class="clip superpuesta[^"]*"[^>]*data-start="2\.000" data-duration="1\.500"/);
    const plan = planMezcla(p, "/d", duracionEscenas(p) + 2, true);
    expect(plan.filtro).toContain("adelay=delays=3300");
    expect(plan.filtro).toMatch(/amix=inputs=2:normalize=0:duration=first\[out\]/);
    expect(() => ed(p, parse({ tipo: "agregarClipLibre", pista: "voz", asset: "whoosh", inicio: 0 }))).toThrow(/reservada/);
    const sin = ed(p, { tipo: "quitarClipLibre", clip: "efectos-1" });
    expect(sin.pistas.some((x) => x.id === "efectos")).toBe(false);
    expect(sin.assets.whoosh).toBeUndefined();
  });

  it("el .otio exporta la voz por tramos, el fundido y las pistas libres", () => {
    const p = ed(
      proyectoDePrueba(),
      { tipo: "recortarPalabras", escena: "e01", desde: 2, hasta: 3 },
      { tipo: "efectosVisual", escena: "e03", transicion: { tipo: "fundido", duracion: 0.4 } },
      parse({ tipo: "agregarClipLibre", pista: "broll", asset: "clip-02", inicio: 1, duracion: 1 }),
    );
    type J = Record<string, unknown> & { children?: J[] };
    const pistas = ((aOtio(p, "/d").tracks as J).children!) as J[];
    const voz = pistas.find((x) => x.name === "Voz")!;
    expect(voz.children!.filter((x) => String(x.name).startsWith("Voz 1."))).toHaveLength(2);
    expect(pistas.find((x) => x.name === "Visual")!.children!.some((x) => x.OTIO_SCHEMA === "Transition.1")).toBe(true);
    const broll = pistas.find((x) => x.name === "Superposición broll")!;
    expect(broll.children!.map((x) => x.OTIO_SCHEMA)).toEqual(["Gap.1", "Clip.2"]);
  });
});

describe("plataformas y licencias", () => {
  it("en 9:16 la banda segura es la intersección de las plataformas elegidas", () => {
    const todas = metricas("9:16", { plataformas: ["tiktok", "youtube", "instagram"] });
    for (const pl of ["tiktok", "youtube", "instagram"] as const) expect(dentro(todas.segura, zonaPlataforma(pl))).toBe(true);
    expect(dentro(todas.subs, todas.segura)).toBe(true);
    // 16:9 no cambia.
    expect(metricas("16:9", { plataformas: ["tiktok"] })).toEqual(metricas("16:9"));
  });

  it("con todas las plataformas, todo sigue dentro y los subtítulos siguen legibles", () => {
    for (const pt of PLANTILLAS_INICIALES) {
      const p = ed(proyectoDePrueba(), { tipo: "cambiarDestino", plataformas: ["tiktok", "youtube", "instagram", "facebook"] });
      const c = compilar(p, pt.datos, "/tmp/m.wav", "/tmp/p");
      expect(c.cajas.filter((x) => !x.dentro).map((x) => x.nombre)).toEqual([]);
      const sub = revisarSubtitulos(p.formato, c.grupos, c.inicioTarjeta, p.plataformas);
      expect(sub.peorLineas).toBeLessThanOrEqual(2);
    }
  });

  it("clasifica licencias y bloquea las dudosas sólo con uso comercial", () => {
    expect(usoComercial("Apache-2.0 (Kokoro-82M)")).toBe("si");
    expect(usoComercial("OpenRAIL++-M (RealVisXL V5 Lightning, vía MPT)")).toBe("si");
    expect(usoComercial("propia (subida por la persona)")).toBe("si");
    expect(usoComercial("CC BY-NC 4.0")).toBe("no");
    expect(usoComercial("desconocida (canciones de MPT)")).toBe("desconocido");
    expect(usoComercial("revisar: modelo de imagen de MPT «x»")).toBe("desconocido");
    const lic = [{ asset: "voz", licencia: "Apache-2.0" }, { asset: "musica", licencia: "desconocida" }];
    expect(reglaLicencias(lic, false)).toMatchObject({ ok: false, aviso: true });
    expect(reglaLicencias(lic, true)).toMatchObject({ ok: false, aviso: false });
    expect(reglaLicencias([lic[0]!], true)).toMatchObject({ ok: true });
  });
});

describe("confianza de la alineación", () => {
  it("lee silencedetect y puntúa acuerdo, silencio y duración", () => {
    const sil = leerSilencios("[silencedetect @ 0x1] silence_start: 4.0\n[silencedetect @ 0x1] silence_end: 5.2 | silence_duration: 1.2\n");
    expect(sil).toEqual([{ inicio: 4, fin: 5.2 }]);
    expect(parecido("Está", "esta")).toBe(1);
    const w = puntuarPalabras(
      [
        { texto: "hola", inicio: 0, fin: 0.4 },
        { texto: "mundo", inicio: 0.4, fin: 0.9 },
        { texto: "fantasma", inicio: 4.2, fin: 4.8 }, // dentro del silencio
        { texto: "x", inicio: 6, fin: 6.01 }, // dura 10 ms
      ],
      [{ text: "hola", start: 0, end: 0.4 }, { text: "mundos", start: 0.4, end: 0.9 }, { text: "fantasma", start: 4.2, end: 4.8 }, { text: "x", start: 6, end: 6.01 }],
      sil,
    );
    expect(w.map((x) => x.confianza)).toEqual([1, expect.any(Number), 0.2, 0.4]);
    expect(w[1]!.confianza!).toBeGreaterThan(0.5);
    const r = resumirConfianza([{ id: "e01", palabras: w }]);
    expect(r).toMatchObject({ medidas: 4, dudosas: 2 });
    // 50 % dudosas: transcripción fallida, bloquea.
    expect(reglaAlineacion(r)).toMatchObject({ ok: false, aviso: false });
    expect(reglaAlineacion(resumirConfianza([{ id: "e", palabras: [{ texto: "a", inicio: 0, fin: 1 }] }]))).toBeNull();
  });
});

describe("música al ritmo", () => {
  it("elige el inicio de la música que pone más cortes en pulso", () => {
    const pulsos = Array.from({ length: 80 }, (_, i) => 0.25 + i * 0.5); // 120 BPM desde 0,25 s
    const cortes = [3.3, 6.3, 9.8]; // separados por múltiplos de 0,5 s salvo el último (+0,5)
    const { inicio, ritmo } = mejorInicio(cortes, pulsos, 10);
    expect(ritmo.enPulso).toBe(3);
    expect(medirRitmo(cortes, pulsos, inicio).enPulso).toBe(3);
    expect(inicio).toBeCloseTo(0.45, 3); // 3,3 + 0,45 = 3,75, un pulso
    expect(pulsosEnLinea(pulsos, inicio, 2)[0]).toBeCloseTo(0.3, 3);
    expect(reglaRitmo(ritmo)).toMatchObject({ ok: true, aviso: true });
  });

  it("fijar la música mueve su inicio y deja los pulsos como marcadores", () => {
    const base = proyectoDePrueba();
    base.assets.musica = { id: "musica", tipo: "audio", ruta: "assets/musica.mp3", hash: h, source: "archivo", licencia: "CC0", duracion: 60, regenerar: {} };
    base.pistas.push({ id: "musica", tipo: "audio", clips: [{ id: "musica-1", asset: "musica", rango: { inicio: 0, duracion: 60 }, volumen: 0.15 }] });
    const p = ed(validarProyecto(base), { tipo: "fijarMusica", inicio: 1.25, pulsos: [0.5, 1, 1.5] });
    expect(pista(p, "musica").clips[0]!.rango).toEqual({ inicio: 1.25, duracion: 58.75 });
    expect(p.marcadores.filter((m) => m.tipo === "pulso")).toHaveLength(3);
    expect(planMezcla(p, "/d", 20, true).filtro).toContain("atrim=start=1.2500:duration=20.0000");
  });
});
