import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agrupar, aplicarCorrecciones, lineas, reemplazar, type Ficha } from "@/lib/subtitulos";

const PY = path.join(process.cwd(), "py", "geeper_py.py");
const py = (accion: string, datos: unknown) => JSON.parse(execFileSync("python3", [PY, accion], { input: JSON.stringify(datos) }).toString());

const guion = "Vice City te espera. GTA seis llega pronto, y nadie sabe qué pasará en GTA seis… ¿Listo?";
const palabras = guion.split(" ").map((t, i) => ({ text: t, start: i * 0.4, end: i * 0.4 + (i % 5 === 4 ? 0.2 : 0.38) }));
const fichas: Ficha[] = palabras.map((w, i) => ({ texto: w.text, inicio: w.start, fin: w.end, origen: [i, i + 1] }));

describe("paridad con mpt_acabado.py", () => {
  it("reemplazar = reemplazos()", () => {
    const esperado = py("reemplazos", { palabras, pares: ["GTA seis=GTA VI"] }) as { text: string; start: number; end: number }[];
    const nuestro = reemplazar(fichas, [{ de: "GTA seis", a: "GTA VI" }]);
    expect(nuestro.map((f) => [f.texto, +f.inicio.toFixed(6), +f.fin.toFixed(6)])).toEqual(
      esperado.map((w) => [w.text, +w.start.toFixed(6), +w.end.toFixed(6)]),
    );
  });

  it("agrupar = agrupar()", () => {
    const esperado = py("agrupar", { palabras }) as { text: string }[][];
    const nuestro = agrupar(fichas);
    expect(nuestro.map((g) => g.map((f) => f.texto))).toEqual(esperado.map((g) => g.map((w) => w.text)));
  });

  it("alinear() pone la puntuación del guion sobre los tiempos de whisper", () => {
    const w = [
      { text: "hola", start: 0, end: 0.3 },
      { text: "mundo", start: 0.35, end: 0.7 },
    ];
    const r = py("alinear", { guion: "¡Hola, mundo!", palabras: w });
    expect(r).toEqual([
      { text: "¡Hola,", start: 0, end: 0.3 },
      { text: "mundo!", start: 0.35, end: 0.7 },
    ]);
  });
});

describe("correcciones", () => {
  const ps = [
    { texto: "Los", inicio: 0, fin: 0.2 },
    { texto: "faros", inicio: 0.2, fin: 0.6 },
    { texto: "brillan.", inicio: 0.6, fin: 1.0 },
  ];
  it("reparte los tiempos del tramo corregido y conserva el origen", () => {
    const r = aplicarCorrecciones(ps, [{ desde: 1, hasta: 3, texto: "faros siguen brillando." }]);
    expect(r.map((f) => f.texto)).toEqual(["Los", "faros", "siguen", "brillando."]);
    expect(r[1]!.inicio).toBeCloseTo(0.2);
    expect(r[3]!.fin).toBeCloseTo(1.0);
    expect(r[2]!.origen).toEqual([1, 3]);
  });
  it("una corrección vacía oculta esas palabras", () => {
    expect(aplicarCorrecciones(ps, [{ desde: 0, hasta: 1, texto: "" }]).map((f) => f.texto)).toEqual(["faros", "brillan."]);
  });
});

it("lineas no parte palabras", () => {
  expect(lineas("operan en condiciones climáticas", 18)).toEqual(["operan en", "condiciones", "climáticas"]);
});
