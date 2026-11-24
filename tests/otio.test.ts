import { describe, expect, it } from "vitest";
import { pista } from "@/lib/esquema";
import { duracionEscenas } from "@/lib/linea";
import { aOtio } from "@/lib/otio";
import { proyectoDePrueba } from "./fixtures";

type J = Record<string, unknown> & { children?: J[] };
const segundos = (r: J) => (r.value as number) / (r.rate as number);
const largo = (track: J) =>
  track.children!.reduce((s, c) => s + segundos((c.source_range as J).duration as J), 0);

describe("exportar a OpenTimelineIO", () => {
  it("las pistas duran lo mismo que las escenas y la voz arranca tras la entrada", () => {
    const p = proyectoDePrueba();
    const t = aOtio(p, "/datos/proyecto");
    const pistas = (t.tracks as J).children!;
    expect(pistas.map((x) => x.name)).toEqual(expect.arrayContaining(["Visual", "Voz"]));
    for (const x of pistas.filter((x) => x.name !== "Música")) expect(largo(x)).toBeCloseTo(duracionEscenas(p), 2);
    const voz = pistas.find((x) => x.name === "Voz")!;
    expect(voz.children![0]!.OTIO_SCHEMA).toBe("Gap.1");
    expect(segundos((voz.children![0]!.source_range as J).duration as J)).toBeCloseTo(0.3);
  });

  it("si el clip es más corto que la escena, vuelve a empezar como en el render", () => {
    const p = proyectoDePrueba();
    const a = p.assets[pista(p, "visual").clips[1]!.asset]!;
    a.duracion = 1; // mucho más corto que la escena
    const visual = (aOtio(p, "/d").tracks as J).children!.find((x) => x.name === "Visual")!;
    const vueltas = visual.children!.filter((c) => String(c.name).startsWith("Escena 2"));
    expect(vueltas.length).toBeGreaterThan(1);
    for (const c of vueltas) {
      const r = c.source_range as J;
      expect(segundos(r.start_time as J) + segundos(r.duration as J)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("FilmCraft recibe el tamaño, los fps y el volumen de la música", () => {
    const p = proyectoDePrueba();
    p.formato = "9:16";
    const t = aOtio(p, "/d");
    const ajustes = ((t.metadata as J).filmcraft as J).settings as J;
    // Los campos obligatorios del deserializador de FilmCraft (si falta uno, abre en 1920×1080).
    for (const k of ["width", "height", "frame_rate", "par", "sample_rate", "drop_frame", "preset", "audio_master", "preview_codec", "max_bit_depth", "max_render_quality", "working_space"]) {
      expect(ajustes).toHaveProperty(k);
    }
    expect([ajustes.width, ajustes.height]).toEqual([1080, 1920]);
    expect(ajustes.frame_rate).toEqual({ num: p.fps, den: 1 });
    p.assets.musica = { ...p.assets.voz!, id: "musica", ruta: "assets/musica.mp3", duracion: 60 };
    p.pistas.push({ id: "musica", tipo: "audio", clips: [{ id: "m1", asset: "musica", rango: { inicio: 0, duracion: 60 }, volumen: 0.15 }] });
    const musica = (aOtio(p, "/d").tracks as J).children!.find((x) => x.name === "Música")!;
    expect(((musica.children![0]!.metadata as J).filmcraft as J).gain_db).toBeCloseTo(-16.48, 2);
    p.formato = "16:9";
    expect(((((aOtio(p, "/d").metadata as J).filmcraft as J).settings as J).width)).toBe(1920);
  });

  it("los fundidos usan el nombre que FilmCraft reconoce", () => {
    const p = proyectoDePrueba();
    pista(p, "visual").clips[1]!.transicion = { tipo: "fundido", duracion: 0.4 };
    const visual = (aOtio(p, "/d").tracks as J).children!.find((x) => x.name === "Visual")!;
    const tr = visual.children!.find((c) => c.OTIO_SCHEMA === "Transition.1");
    expect(tr?.name).toBe("Cross Dissolve");
  });

  it("las rutas son absolutas y codificadas como file://", () => {
    const t = JSON.stringify(aOtio(proyectoDePrueba(), "/datos/mi proyecto"));
    expect(t).toContain("file:///datos/mi%20proyecto/");
  });
});

describe("SVG en el .otio", () => {
  it("un sustituto reemplaza la ruta del asset (FilmCraft no lee SVG)", async () => {
    const { aOtio } = await import("@/lib/otio");
    const { proyectoDePrueba } = await import("./fixtures");
    const p = proyectoDePrueba();
    const id = Object.keys(p.assets).find((k) => p.assets[k]!.tipo !== "audio")!;
    const texto = JSON.stringify(aOtio(p, "/datos/proyecto", { [id]: "/datos/proyecto/exportes/svg/logo.png" }));
    expect(texto).toContain("file:///datos/proyecto/exportes/svg/logo.png");
    expect(texto).not.toContain(`file:///datos/proyecto/${p.assets[id]!.ruta}"`);
  });
});
