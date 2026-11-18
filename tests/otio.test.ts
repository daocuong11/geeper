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

  it("las rutas son absolutas y codificadas como file://", () => {
    const t = JSON.stringify(aOtio(proyectoDePrueba(), "/datos/mi proyecto"));
    expect(t).toContain("file:///datos/mi%20proyecto/");
  });
});
