/**
 * Portadas (estilos, títulos, diseño propio), looks de color, instalación de PhotoCraft y la miniatura de
 * YouTube. Sin red: fetch simulado; sin IA: sólo las funciones puras.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { formatoDe, revisarDiseno } from "@/lib/apariencia";
import { compilar } from "@/lib/compilador";
import { pista } from "@/lib/esquema";
import { PLANTILLAS_INICIALES } from "@/lib/plantillas";
import { sumaEsperada } from "@/lib/instalar-photocraft";
import { conColor, nivelesAuto, pasosLut, LOOKS } from "@/lib/looks";
import { capasDe } from "@/lib/photocraft";
import { ESTILOS_PORTADA, imagenesPorEscena, medidasPortada, pasosPlantillaBase, tintaSobre } from "@/lib/portada";
import { limpiarTitulos, promptTitulos, titulosSugeridos } from "@/lib/titulos";
import type { CuentaDescifrada, Red } from "@/lib/redes/tipos";
import { proyectoDePrueba } from "./fixtures";

const plantilla = {
  colores: { tinta: "#ffffff", activa: "#fff", acento1: "#ffd400", acento2: "#00f", fondoPastilla: "#000", fondoCierre: "#000" },
  tipografia: { titulos: "Inter", texto: "Inter", pesoTexto: 800 },
  marca: { texto: "Canal", logo: null },
};

describe("estilos de portada", () => {
  it("cada estilo deja título y marca dentro del lienzo en cada formato", () => {
    for (const estilo of Object.keys(ESTILOS_PORTADA) as (keyof typeof ESTILOS_PORTADA)[]) {
      for (const f of ["16:9", "9:16", "1:1"] as const) {
        const { ancho, alto } = medidasPortada(f);
        const { nuevo, pasos } = pasosPlantillaBase(f, plantilla, "/x/@imagen.png", estilo);
        expect([nuevo.width, nuevo.height]).toEqual([ancho, alto]);
        const t = pasos.find((p) => p.params.name === "@titulo")!.params.box as number[];
        expect(t[0]! >= 0 && t[1]! >= 0 && t[0]! + t[2]! <= ancho && t[1]! + t[3]! <= alto, `${estilo} ${f}`).toBe(true);
        expect(pasos.some((p) => p.params.name === "@marca")).toBe(true);
      }
    }
  });

  it("en la banda, el título es oscuro sobre un color claro y claro sobre uno oscuro", () => {
    expect(tintaSobre("#ffd400")).toBe("#111111");
    expect(tintaSobre("#e5e8f0")).toBe("#111111");
    expect(tintaSobre("#1a237e")).toBe("#ffffff");
    expect(tintaSobre("#f00")).toBe("#111111");
    expect(tintaSobre("rgba(0,0,0,1)")).toBe("#ffffff"); // no es #hex: blanco por defecto
  });

  it("ofrece una imagen por escena, a la mitad de cada una", () => {
    const p = proyectoDePrueba();
    const imgs = imagenesPorEscena(p);
    expect(imgs.length).toBe(Object.keys(p.escenas).length);
    expect(new Set(imgs.map((x) => x.escena)).size).toBe(imgs.length);
  });
});

describe("títulos propuestos", () => {
  it("limpia la respuesta del LLM: JSON, listas numeradas, comillas, hashtags y repetidos", () => {
    expect(limpiarTitulos('{"titulos": ["Faros que nadie visita", "¿Por qué siguen encendidos?", "faros que nadie visita"]}')).toEqual(["Faros que nadie visita", "¿Por qué siguen encendidos?"]);
    expect(limpiarTitulos('1. "El faro más raro" #faros\n2) «Otro faro»\n- x\n')).toEqual(["El faro más raro", "Otro faro"]);
    expect(limpiarTitulos("x".repeat(200))).toEqual([]);
  });
  it("sin IA sugiere el nombre y el tema sin repetir", () => {
    expect(titulosSugeridos("Faros raros", "faros raros")).toEqual(["Faros raros"]);
    expect(titulosSugeridos("Faros", "los faros más raros")).toEqual(["Faros", "Los faros más raros"]);
  });
  it("el prompt pide JSON, prohíbe inventar y recorta el guion", () => {
    const pr = promptTitulos({ tema: "faros", guion: "a ".repeat(3000), formato: "9:16" });
    expect(pr).toContain('{"titulos"');
    expect(pr).toMatch(/sin mentir/);
    expect(pr.length).toBeLessThan(2600);
  });
});

describe("diseño propio", () => {
  const capas = (ls: { id: number; name: string; kind: string }[]) => capasDe({ layers: ls });
  it("explica qué encontró y qué falta", () => {
    const r = revisarDiseno(capas([{ id: 1, name: "@titulo", kind: "Type" }, { id: 2, name: "@imagen", kind: "Smart Object" }, { id: 3, name: "@otra", kind: "Type" }]));
    expect(r.ok).toBe(true);
    expect(r.encontradas).toEqual(["el título", "la imagen del video"]);
    expect(r.faltan[0]).toMatch(/marca/);
    expect(r.extra).toEqual(["@otra"]);
  });
  it("rechaza un diseño sin capas para llenar o con la clase equivocada", () => {
    expect(revisarDiseno(capas([{ id: 1, name: "Título", kind: "Type" }])).ok).toBe(false);
    const mal = revisarDiseno(capas([{ id: 1, name: "@titulo", kind: "Pixel" }]));
    expect(mal.ok).toBe(false);
    expect(mal.problemas[0]).toMatch(/capa de texto/);
  });
  it("deduce el formato por la proporción", () => {
    expect(formatoDe(1280, 720)).toBe("16:9");
    expect(formatoDe(1080, 1920)).toBe("9:16");
    expect(formatoDe(1000, 1100)).toBe("1:1");
  });
});

describe("color", () => {
  const plano = (v: number) => Array.from({ length: 256 }, (_, i) => (i === v ? 100 : 0));
  const rango = (lo: number, hi: number) => Array.from({ length: 256 }, (_, i) => (i >= lo && i <= hi ? 10 : 0));
  it("niveles automáticos: estira un rango lavado, con topes y sin sobrecorregir", () => {
    const n = nivelesAuto({ r: rango(30, 220), g: rango(30, 220), b: rango(30, 220) })!;
    expect(n.red.inBlack).toBeGreaterThanOrEqual(30);
    expect(n.red.inWhite).toBeLessThanOrEqual(220);
    const extremo = nivelesAuto({ r: rango(90, 120), g: rango(90, 120), b: rango(90, 120) })!;
    expect(extremo.red.inBlack).toBeLessThanOrEqual(40); // tope del negro
    expect(extremo.red.inWhite).toBeGreaterThanOrEqual(200); // tope del blanco
    expect(nivelesAuto({ r: rango(0, 255), g: rango(0, 255), b: rango(0, 255) })).toBeNull(); // ya está bien
    expect(nivelesAuto({ r: plano(0).map(() => 0), g: plano(0), b: plano(0) })).toBeNull(); // sin datos
  });
  it("la pila de ajustes respeta el orden y la intensidad", () => {
    const n = { red: { inBlack: 10, inWhite: 240 }, green: { inBlack: 10, inWhite: 240 }, blue: { inBlack: 10, inWhite: 240 } };
    expect(pasosLut({ look: "tealOrange", intensidad: 0.5, mejora: true }, n).map((p) => p.cmd)).toEqual([
      "layer.newAdjustmentLayer.levels",
      "layer.newAdjustmentLayer.vibrance",
      "layer.newAdjustmentLayer.colorLookup",
    ]);
    expect(pasosLut({ look: "warm", intensidad: 0.5, mejora: false }, null)[0]!.params).toEqual({ lut: "warm", opacity: 0.5 });
    expect(conColor({ look: "ninguno", intensidad: 1, mejora: false })).toBe(false);
    expect(conColor({ look: "cool", intensidad: 0, mejora: false })).toBe(false);
    expect(Object.keys(LOOKS)).toContain("ninguno");
  });
});

describe("color en la composición", () => {
  it("compilar usa el clip con color en lugar del original, sin tocar los demás", () => {
    const p = proyectoDePrueba();
    const [a, b] = pista(p, "visual").clips.map((c) => p.assets[c.asset]!);
    const comp = compilar(p, PLANTILLAS_INICIALES[0]!.datos, "/x/mezcla.wav", "/datos/proy", { [a!.id]: "/datos/proy/assets/color/clip-x.mp4" });
    expect(Object.values(comp.archivos)).toContain("/datos/proy/assets/color/clip-x.mp4");
    expect(Object.values(comp.archivos)).not.toContain(`/datos/proy/${a!.ruta}`);
    if (b && b.id !== a!.id) expect(Object.values(comp.archivos)).toContain(`/datos/proy/${b.ruta}`);
  });
});

describe("instalación de PhotoCraft", () => {
  it("lee la suma del archivo exacto en SHA256SUMS.txt", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    const sumas = `${a}  photocraft-0.23.1-linux-x86_64.tar.gz.asc\n${b}  photocraft-0.23.1-linux-x86_64.tar.gz\n`;
    expect(sumaEsperada(sumas, "photocraft-0.23.1-linux-x86_64.tar.gz")).toBe(b);
    expect(sumaEsperada(sumas, "otro.tar.gz")).toBeNull();
  });
});

describe("miniatura en YouTube", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geeper-mini-"));
  const antes = process.env.GEEPER_CONFIG;
  let youtube: Red;
  beforeAll(async () => {
    fs.writeFileSync(path.join(dir, "redes.json"), JSON.stringify({ youtube: { clientId: "x", clientSecret: "y" } }), { mode: 0o600 });
    process.env.GEEPER_CONFIG = dir;
    youtube = (await import("@/lib/redes/youtube")).youtube;
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => {
    if (antes === undefined) delete process.env.GEEPER_CONFIG;
    else process.env.GEEPER_CONFIG = antes;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const cuenta: CuentaDescifrada = { id: "c1", red: "youtube", externoId: "e", usuario: "u", acceso: "token-falso", refresco: null, expira: null, scopes: "" };

  it("sube el JPG a thumbnails.set con el video correcto", async () => {
    const llamadas: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url: String(url), init });
      return new Response("{}", { status: 200 });
    }));
    await youtube.miniatura!(cuenta, "vid123", Buffer.from([0xff, 0xd8, 0xff]));
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toContain("/upload/youtube/v3/thumbnails/set?videoId=vid123");
    expect(new Headers(llamadas[0]!.init?.headers).get("content-type")).toBe("image/jpeg");
  });

  it("explica el 403 de un canal sin verificar y rechaza más de 2 MB", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"code":403}}', { status: 403 })));
    await expect(youtube.miniatura!(cuenta, "v", Buffer.from([1]))).rejects.toThrow(/verificado por teléfono/);
    await expect(youtube.miniatura!(cuenta, "v", Buffer.alloc(2 * 1024 * 1024 + 1))).rejects.toThrow(/2 MB/);
  });
});
