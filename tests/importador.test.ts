import { describe, expect, it } from "vitest";
import { imagenesFaltantes } from "@/lib/importador";

describe("compuerta de imágenes de MPT", () => {
  it("rechaza una tarea que entregó 1 de 5 imágenes (caso real del 2026-11-18)", () => {
    expect(imagenesFaltantes(5, 1)).toMatch(/1 de 5/);
  });
  it("acepta lo completo o casi completo", () => {
    expect(imagenesFaltantes(5, 5)).toBeNull();
    expect(imagenesFaltantes(5, 3)).toBeNull();
  });
  it("no exige nada si MPT no dice cuántas pidió", () => {
    expect(imagenesFaltantes(0, 1)).toBeNull();
  });
});
