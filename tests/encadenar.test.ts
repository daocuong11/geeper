import { describe, expect, it } from "vitest";
import { aplicarPasos, resolverReferencias, type ResultadoPaso } from "@/lib/encadenar";
import { proyectoDePrueba } from "./fixtures";

const r = (id: string): ResultadoPaso => ({ id, textos: [id], clips: [], escenas: [] });

describe("referencias entre pasos", () => {
  it("$N.ruta da el valor tal cual y ${N.ruta} lo mete en un texto", () => {
    const res = [r("texto-1"), r("texto-2")];
    expect(resolverReferencias({ id: "$1.id", lista: ["$ultimo.id"], nota: "ver ${2.id} y ${1.textos.0}" }, res, 3))
      .toEqual({ id: "texto-1", lista: ["texto-2"], nota: "ver texto-2 y texto-1" });
  });
  it("$$ es un $ literal y otros $ quedan igual", () => {
    expect(resolverReferencias("$$1.id cuesta $5 o $$", [r("a")], 2)).toBe("$1.id cuesta $5 o $");
    expect(resolverReferencias("$1-$2", [r("a")], 2)).toBe("$1-$2");
  });
  it("explica la referencia rota", () => {
    expect(() => resolverReferencias("$2.id", [r("a")], 2)).toThrow(/paso 2, que no corrió/);
    expect(() => resolverReferencias("$1.clips.0", [r("a")], 2)).toThrow(/no creó «clips.0»/);
    expect(() => resolverReferencias("$1.id", [{ textos: [], clips: [], escenas: [] }], 2)).toThrow(/no creó «id»/);
  });
});

describe("aplicar pasos encadenados", () => {
  it("crea un texto y lo edita en el paso siguiente usando su id", () => {
    const { nuevo, pasos } = aplicarPasos(proyectoDePrueba(), [
      { tipo: "agregarTexto", texto: { texto: "50 % OFF", inicio: 1, duracion: 3 } },
      { tipo: "editarTexto", id: "$1.id", cambios: { posicion: "centro", texto: "Hoy: ${1.id}" } },
    ]);
    expect(pasos.map((p) => p.estado)).toEqual(["ok", "ok"]);
    expect(pasos[0]!.resultado).toMatchObject({ id: "texto-1", textos: ["texto-1"] });
    expect(nuevo!.textos.find((t) => t.id === "texto-1")).toMatchObject({ posicion: "centro", texto: "Hoy: texto-1" });
  });
  it("si una referencia falla, no aplica nada y omite lo que sigue", () => {
    const { nuevo, pasos } = aplicarPasos(proyectoDePrueba(), [
      { tipo: "editarTexto", id: "$2.id", cambios: { posicion: "centro" } },
      { tipo: "agregarTexto", texto: { texto: "x", inicio: 1, duracion: 3 } },
    ]);
    expect(nuevo).toBeNull();
    expect(pasos.map((p) => p.estado)).toEqual(["error", "omitido"]);
    expect(pasos[0]!.error).toMatch(/no corrió/);
  });
});
