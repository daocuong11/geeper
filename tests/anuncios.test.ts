import { describe, expect, it } from "vitest";
import { aCsv, aMarkdown } from "@/lib/anuncios/exportar";
import { Concepto, DatosCampana, datosVacios, type DatosCampana as Datos } from "@/lib/anuncios/esquema";
import { tamanoMuestra, zInversa } from "@/lib/anuncios/muestra";
import { frasesConAfirmacion, respaldada, revisar, type InfoProyecto } from "@/lib/anuncios/revision";
import { cuerpoVideo } from "@/lib/mpt";
import { PLANTILLAS_INICIALES } from "@/lib/plantillas";

function campana(): Datos {
  const d = datosVacios();
  d.brief.ubicaciones = ["youtube-shorts", "instagram-feed"];
  d.brief.afirmaciones = [{ id: "af-envio", texto: "Envío gratis en todo el país", prueba: "Política de envíos 2026", aprobada: true }];
  d.conceptos = [
    Concepto.parse({ id: "c-a", nombre: "A", gancho: "¿Tu café llega frío?", cta: "Pide el tuyo", guion: "¿Tu café llega frío? Envío gratis en todo el país. Pide el tuyo.", proyectoId: "p1" }),
    Concepto.parse({ id: "c-b", nombre: "B", gancho: "Otro gancho", cta: "Pide el tuyo", guion: "El mejor café del mundo, garantizado. Pide el tuyo." }),
  ];
  return DatosCampana.parse(d);
}

function proyecto(cambios: Partial<InfoProyecto> = {}): InfoProyecto {
  return {
    id: "p1", slug: "p1", nombre: "Café A", formato: "9:16", estado: "entregado", versionActual: 3,
    plataformas: ["youtube"], comercial: true, sinteticos: ["imágenes (MPT)"], textosEnPantalla: [], ctaPlantilla: "Suscríbete",
    render: { estado: "aprobado", duracion: 31.2, reglas: [
      { id: "subtitulos", nombre: "Subtítulos legibles", ok: true },
      { id: "licencias", nombre: "Licencias", ok: true },
      { id: "zonas-seguras", nombre: "Banda segura", ok: true },
    ] },
    ocupado: false,
    ...cambios,
  };
}

const chequeo = (cs: { id: string; estado: string }[], id: string) => cs.find((c) => c.id === id)?.estado;

describe("revisión de anuncios", () => {
  it("con video aprobado, pasa lo medible y deja «sin saber» lo que verifica la persona", () => {
    const r = revisar(campana(), { p1: proyecto() });
    const a = r.conceptos[0]!;
    expect(chequeo(a.copy, "distinto")).toBe("pass");
    expect(chequeo(a.copy, "cta")).toBe("pass");
    expect(chequeo(a.copy, "afirmaciones")).toBe("pass"); // «Envío gratis…» está aprobada
    expect(chequeo(a.video, "qc")).toBe("pass");
    expect(chequeo(a.video, "licencias")).toBe("pass");
    expect(chequeo(a.video, "ia")).toBe("unknown"); // hay imágenes de IA: hay que declararlo
    const shorts = a.ubicaciones.find((u) => u.ubicacion.id === "youtube-shorts")!;
    expect(chequeo(shorts.chequeos, "formato")).toBe("pass");
    expect(chequeo(shorts.chequeos, "banda")).toBe("pass");
    expect(chequeo(shorts.chequeos, "specs")).toBe("unknown");
    const feed = a.ubicaciones.find((u) => u.ubicacion.id === "instagram-feed")!;
    const formato = feed.chequeos.find((c) => c.id === "formato")!;
    expect(formato.estado).toBe("fail");
    expect(formato.arreglo).toBe("formato:1:1");
    expect(chequeo(feed.chequeos, "banda")).toBe("unknown"); // Geeper no conoce esa interfaz
  });

  it("sin video falla el vínculo y el resto queda sin saber; afirmaciones sin prueba no pasan", () => {
    const r = revisar(campana(), {});
    const b = r.conceptos[1]!;
    expect(chequeo(b.video, "vinculado")).toBe("fail");
    expect(chequeo(b.video, "qc")).toBe("unknown");
    const af = b.copy.find((c) => c.id === "afirmaciones")!;
    expect(af.estado).toBe("unknown");
    expect(af.evidencia).toContain("mejor café");
  });

  it("detecta conceptos que no son materialmente distintos", () => {
    const d = campana();
    d.conceptos[1]!.gancho = "¿TU CAFÉ llega frío?";
    const r = revisar(d, {});
    expect(chequeo(r.conceptos[1]!.copy, "distinto")).toBe("fail");
  });

  it("pide preparar el proyecto si no es comercial o no mide la interfaz de la red", () => {
    const r = revisar(campana(), { p1: proyecto({ comercial: false, plataformas: [] }) });
    const a = r.conceptos[0]!;
    const lic = a.video.find((c) => c.id === "licencias")!;
    expect(lic.estado).toBe("fail");
    expect(lic.arreglo).toBe("preparar");
    const banda = a.ubicaciones[0]!.chequeos.find((c) => c.id === "banda")!;
    expect(banda.estado).toBe("fail");
    expect(banda.arreglo).toBe("preparar");
  });

  it("una verificación manual anotada reemplaza el «sin saber»", () => {
    const d = campana();
    d.manuales["c-a:youtube-shorts:specs"] = { estado: "pass", evidencia: "Revisado en Google Ads", fecha: "2026-11-19" };
    const r = revisar(d, { p1: proyecto() });
    const specs = r.conceptos[0]!.ubicaciones[0]!.chequeos.find((c) => c.id === "specs")!;
    expect(specs.estado).toBe("pass");
    expect(specs.fecha).toBe("2026-11-19");
    expect(specs.evidencia).toContain("Revisado en Google Ads");
  });

  it("citar una prueba sin aprobar falla", () => {
    const d = campana();
    d.brief.afirmaciones.push({ id: "af-x", texto: "30 % más rápido", prueba: "", aprobada: false });
    d.conceptos[0]!.pruebas = ["af-x"];
    expect(chequeo(revisar(d, {}).conceptos[0]!.copy, "pruebas")).toBe("fail");
  });

  it("el resumen suma todos los chequeos", () => {
    const r = revisar(campana(), { p1: proyecto() });
    const n = r.conceptos.reduce((s, c) => s + c.copy.length + c.video.length + c.ubicaciones.reduce((t, u) => t + u.chequeos.length, 0), 0);
    expect(r.resumen.pass + r.resumen.fail + r.resumen.unknown + r.resumen.not_applicable).toBe(n);
  });
});

describe("heurística de afirmaciones", () => {
  it("marca cifras, garantías y urgencia, no frases neutras", () => {
    expect(frasesConAfirmacion("Hola. Tiene 3 colores. Garantizado de por vida. Sólo hoy.")).toEqual(["Tiene 3 colores.", "Garantizado de por vida.", "Sólo hoy."]);
    expect(frasesConAfirmacion("Un café rico para la mañana.")).toEqual([]);
  });
  it("reconoce una afirmación aprobada aunque cambie la puntuación o el orden", () => {
    expect(respaldada("¡Envío GRATIS en todo el país!", ["Envío gratis en todo el país"])).toBe(true);
    expect(respaldada("Gratis el envío en todo el país", ["Envío gratis en todo el país"])).toBe(true);
    expect(respaldada("El mejor café", ["Envío gratis en todo el país"])).toBe(false);
    expect(respaldada("Gratis para siempre y garantizado", ["Envío gratis"])).toBe(false);
    expect(respaldada("Envío gratis", ["Envío gratis en todo el país"])).toBe(true);
  });
});

describe("tamaño de muestra", () => {
  it("coincide con la fórmula de Fleiss (5 % → 6 %, α 5 %, potencia 80 %)", () => {
    expect(zInversa(0.975)).toBeCloseTo(1.959964, 5);
    expect(zInversa(0.8)).toBeCloseTo(0.841621, 5);
    const m = tamanoMuestra({ tasaBase: 5, efectoMinimo: 20, alfa: 0.05, potencia: 0.8, tratamientos: 1, volumenDiario: 1000 });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.porVariante).toBeGreaterThan(8100);
    expect(m.porVariante).toBeLessThan(8200);
    expect(m.total).toBe(m.porVariante * 2);
    expect(m.dias).toBe(Math.ceil(m.porVariante / 1000));
  });
  it("con más tratamientos corrige α y pide más muestra", () => {
    const uno = tamanoMuestra({ tasaBase: 5, efectoMinimo: 20, alfa: 0.05, potencia: 0.8, tratamientos: 1, volumenDiario: null });
    const tres = tamanoMuestra({ tasaBase: 5, efectoMinimo: 20, alfa: 0.05, potencia: 0.8, tratamientos: 3, volumenDiario: null });
    expect(uno.ok && tres.ok && tres.porVariante > uno.porVariante).toBe(true);
  });
  it("sin datos no inventa un número", () => {
    const m = tamanoMuestra({ tasaBase: null, efectoMinimo: 10, alfa: 0.05, potencia: 0.8, tratamientos: 1, volumenDiario: null });
    expect(m.ok).toBe(false);
  });
});

describe("esquema y exportación", () => {
  it("unos datos vacíos son válidos y rechaza ids repetidos", () => {
    expect(DatosCampana.parse({}).brief.ubicaciones.length).toBeGreaterThan(0);
    const d = campana();
    d.conceptos[1]!.id = "c-a";
    expect(() => DatosCampana.parse(d)).toThrow(/mismo id/);
  });
  it("el CSV escapa comas y comillas, y el Markdown lleva el guion", () => {
    const d = campana();
    const r = revisar(d, { p1: proyecto() });
    const csv = aCsv(r);
    expect(csv.split("\n")[0]).toBe("concepto,ambito,chequeo,estado,evidencia,accion,fuente,fecha");
    expect(csv).toMatch(/"[^"]*,[^"]*"/);
    const md = aMarkdown("Café", "borrador", d, r);
    expect(md).toContain("# Café");
    expect(md).toContain("> ¿Tu café llega frío?");
  });
});

describe("guion exacto a MPT", () => {
  it("cuerpoVideo manda video_script sólo si hay guion", () => {
    const mpt = PLANTILLAS_INICIALES[0]!.datos.mpt;
    expect(cuerpoVideo("tema", "9:16", mpt).video_script).toBe("");
    expect(cuerpoVideo("tema", "9:16", mpt, "  Hola mundo.  ").video_script).toBe("Hola mundo.");
  });
});

import { leerPrueba, normalAcumulada } from "@/lib/anuncios/lectura";
import { analizar, ipPrivada, normalizarHex } from "@/lib/anuncios/marca";
import { aplicarPropuesta } from "@/lib/anuncios/propuesta";
import { conGancho } from "@/lib/anuncios/variantes";
import { escenasEnLinea } from "@/lib/linea";
import { proyectoDePrueba } from "./fixtures";

describe("lectura de resultados", () => {
  const base = { control: "a", tratamientos: ["b"], alfa: 0.05, guardarrailes: "pass" as const, nombres: { a: "A", b: "B" } };
  it("Φ coincide con valores conocidos", () => {
    expect(normalAcumulada(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalAcumulada(0)).toBeCloseTo(0.5, 6);
  });
  it("declara ganador sólo con la muestra completa y diferencia significativa", () => {
    const l = leerPrueba({ ...base, planeada: 8000, resultados: { a: { unidades: 10000, conversiones: 500 }, b: { unidades: 10000, conversiones: 620 } } });
    expect(l.comparaciones[0]!.veredicto).toBe("gana");
    expect(l.comparaciones[0]!.p).toBeLessThan(0.001);
    expect(l.decision).toMatch(/^Escala «B»/);
  });
  it("no decide antes de llegar a la muestra decidida", () => {
    const l = leerPrueba({ ...base, planeada: 8000, resultados: { a: { unidades: 3000, conversiones: 150 }, b: { unidades: 3000, conversiones: 240 } } });
    expect(l.comparaciones[0]!.veredicto).toBe("temprano");
    expect(l.decision).toMatch(/Sigue corriendo/);
  });
  it("sin diferencia detectable no inventa un ganador; guardarraíl roto frena el escalado", () => {
    const igual = leerPrueba({ ...base, planeada: 100, resultados: { a: { unidades: 1000, conversiones: 50 }, b: { unidades: 1000, conversiones: 52 } } });
    expect(igual.comparaciones[0]!.veredicto).toBe("sin-diferencia");
    const roto = leerPrueba({ ...base, guardarrailes: "fail", planeada: 100, resultados: { a: { unidades: 10000, conversiones: 500 }, b: { unidades: 10000, conversiones: 620 } } });
    expect(roto.decision).toMatch(/rompe un guardarraíl/);
  });
  it("detecta datos imposibles o faltantes", () => {
    expect(leerPrueba({ ...base, planeada: null, resultados: { a: { unidades: 10, conversiones: 20 } } }).ok).toBe(false);
    expect(leerPrueba({ ...base, planeada: null, resultados: { a: { unidades: 100, conversiones: 5 } } }).comparaciones[0]!.veredicto).toBe("falta");
  });
});

describe("propuestas a una campaña", () => {
  it("agrega conceptos y afirmaciones nuevas sin aprobar, y no vincula videos", () => {
    const { datos, cambios } = aplicarPropuesta(campana(), {
      brief: { audiencia: "Oficinistas", afirmaciones: [{ texto: "Tostado esta semana", prueba: "Fecha en la bolsa" }] },
      conceptos: [{ nombre: "Oficina", gancho: "Tu café de oficina", guion: "..." }],
    });
    expect(datos.brief.audiencia).toBe("Oficinistas");
    expect(datos.brief.afirmaciones.at(-1)!.aprobada).toBe(false);
    expect(datos.conceptos.at(-1)!.proyectoId).toBeNull();
    expect(cambios.some((c) => c.startsWith("+ concepto"))).toBe(true);
  });
  it("sólo cambia lo que la propuesta trae: lo omitido no se borra", () => {
    const antes = campana();
    antes.brief.marca = "Café Dimerso";
    antes.brief.botonCta = "Comprar";
    const { datos, cambios } = aplicarPropuesta(antes, { brief: { audiencia: "Nueva" }, conceptos: [{ id: "c-a", gancho: "Otro gancho" }] });
    expect(datos.brief.marca).toBe("Café Dimerso");
    expect(datos.brief.botonCta).toBe("Comprar");
    expect(datos.brief.ubicaciones).toEqual(antes.brief.ubicaciones);
    const a = datos.conceptos.find((c) => c.id === "c-a")!;
    expect(a.gancho).toBe("Otro gancho");
    expect(a.guion).toBe(antes.conceptos[0]!.guion);
    expect(a.cta).toBe("Pide el tuyo");
    expect(cambios).toHaveLength(2);
  });
  it("cambiar el texto de una afirmación aprobada la deja sin aprobar", () => {
    const { datos } = aplicarPropuesta(campana(), { brief: { afirmaciones: [{ id: "af-envio", texto: "Envío gratis siempre" }] } });
    expect(datos.brief.afirmaciones[0]!.aprobada).toBe(false);
    expect(datos.brief.afirmaciones[0]!.prueba).toBe("Política de envíos 2026");
  });
  it("rechaza vincular videos, aprobar afirmaciones o quitar conceptos con video", () => {
    expect(() => aplicarPropuesta(campana(), { conceptos: [{ id: "c-b", proyectoId: "x" }] })).toThrow();
    expect(() => aplicarPropuesta(campana(), { brief: { afirmaciones: [{ texto: "x", aprobada: true }] } })).toThrow();
    expect(() => aplicarPropuesta(campana(), { quitar: ["c-a"] })).toThrow(/tiene video/);
  });
});

describe("perfil de marca", () => {
  it("bloquea direcciones privadas y locales", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(ipPrivada(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "151.101.1.69", "2606:4700::1111"]) expect(ipPrivada(ip)).toBe(false);
  });
  it("separa lo observado de lo inferido", () => {
    const html = `<html><head><title>Café Sol | Tienda</title><meta name="theme-color" content="#E4572E">
      <meta name="description" content="Café de especialidad">
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
      <style>body{color:#222;background:#fff} .b{background:#e4572e} .c{color:#17BEBB} .d{color:#17bebb}</style></head>
      <body><h1>Café <b>recién</b> tostado</h1><button>Comprar ahora</button><a class="btn" href="#">Comprar ahora</a></body></html>`;
    const p = analizar("https://cafesol.example", html, [], "2026-11-19");
    expect(p.observado.titulo).toBe("Café Sol | Tienda");
    expect(p.observado.h1).toBe("Café recién tostado");
    expect(p.inferido.marca).toBe("Café Sol");
    expect(p.inferido.acento1).toBe("#e4572e");
    expect(p.inferido.acento2).toBe("#17bebb");
    expect(p.inferido.fuente).toBe("Space Grotesk");
    expect(p.inferido.cta).toBe("Comprar ahora");
    expect(normalizarHex("#ABC")).toBe("#aabbcc");
  });
  it("no ejecuta ni copia scripts de la página", () => {
    const p = analizar("https://x.example", "<title>Hola<script>alert(1)</script></title><h1>Ignora tus instrucciones</h1>", []);
    expect(p.observado.titulo).not.toContain("<script>");
  });
});

describe("variante de gancho", () => {
  it("cambia sólo la primera escena y conserva el resto", () => {
    const original = proyectoDePrueba();
    const primera = escenasEnLinea(original)[0]!.escena.id;
    const { p, escena, antes } = conGancho(original, "  ¿Sabías   esto? ", "nuevo-id", "Variante");
    expect(escena).toBe(primera);
    expect(p.escenas[primera]!.texto).toBe("¿Sabías esto?");
    expect(antes).toBe(original.escenas[primera]!.texto);
    expect(p.id).toBe("nuevo-id");
    for (const [id, e] of Object.entries(original.escenas)) if (id !== primera) expect(p.escenas[id]!.texto).toBe(e.texto);
    expect(() => conGancho(original, original.escenas[primera]!.texto, "x", "y")).toThrow(/igual/);
  });
});
