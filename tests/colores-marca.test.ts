import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ajustarHasta, aTexto, contraste, contrastePeor, leerColor, legibilidad, muestrasRgba, opacidadHasta, paleta, proponerRoles, textoSobre, type Muestra } from "@/lib/colores-marca";
import { paletaDeArchivo } from "@/lib/paleta";

describe("leer y escribir colores", () => {
  it("lee hex corto, largo y rgba", () => {
    expect(leerColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(leerColor("#ff3d81")).toEqual({ r: 255, g: 61, b: 129, a: 1 });
    expect(leerColor("rgba(8, 8, 18, 0.62)")).toEqual({ r: 8, g: 8, b: 18, a: 0.62 });
    expect(leerColor("azul")).toBeNull();
  });
  it("escribe opaco como hex y transparente como rgba", () => {
    expect(aTexto({ r: 255, g: 0, b: 0, a: 1 })).toBe("#ff0000");
    expect(aTexto({ r: 15, g: 23, b: 42, a: 0.66 })).toBe("rgba(15, 23, 42, 0.66)");
  });
});

describe("contraste WCAG", () => {
  it("blanco sobre negro es 21:1 y un color consigo mismo 1:1", () => {
    expect(contraste({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 5);
    expect(contraste({ r: 120, g: 40, b: 200 }, { r: 120, g: 40, b: 200 })).toBeCloseTo(1, 5);
  });
  it("una pastilla semitransparente se mide en el peor caso (video claro)", () => {
    // Pastilla casi transparente: sobre un video blanco, el texto blanco no se lee.
    expect(contrastePeor("#ffffff", "rgba(0, 0, 0, 0.1)")!).toBeLessThan(1.5);
    expect(contrastePeor("#ffffff", "rgba(8, 8, 18, 0.62)")!).toBeGreaterThan(4.5);
  });
  it("clasifica para texto grande", () => {
    expect(legibilidad(5)).toBe("bien");
    expect(legibilidad(3.2)).toBe("justo");
    expect(legibilidad(2)).toBe("mal");
  });
});

describe("arreglos de legibilidad", () => {
  it("las letras del botón: la tinta si se lee, si no negro o blanco", () => {
    expect(textoSobre("#ff3d81", "#ffffff")).toBe("#ffffff"); // GTA VI: se lee (3,4:1), no cambia
    expect(textoSobre("#e2e8f0", "#f8fafc")).toBe("#0b0d12"); // Dimerso: blanco sobre gris claro → negro
    // Degradado amarillo → azul marino: ninguno se lee en los dos; gana el que menos pierde (negro).
    expect(textoSobre(["#fac903", "#0b3d91"], "#ffffff")).toBe("#0b0d12");
  });
  it("sube la opacidad del fondo lo justo", () => {
    const f = opacidadHasta("rgba(0, 0, 0, 0.2)", ["#ffffff"], 4.5)!;
    expect(contrastePeor("#ffffff", f)!).toBeGreaterThanOrEqual(4.5);
    expect(contrastePeor("#ffffff", aTexto({ ...leerColor(f)!, a: leerColor(f)!.a - 0.01 }))!).toBeLessThan(4.5);
    expect(opacidadHasta("rgba(255, 255, 255, 0.5)", ["#ffffff"], 4.5)).toBeNull();
  });
  it("ajusta un color hasta que se lea, y no toca uno que ya se lee", () => {
    const n = ajustarHasta("#1a3f8b", "rgba(8, 8, 18, 0.62)", 4.5)!;
    expect(contrastePeor(n, "rgba(8, 8, 18, 0.62)")!).toBeGreaterThanOrEqual(4.5);
    expect(ajustarHasta("#ffffff", "rgba(8, 8, 18, 0.62)", 4.5)).toBeNull();
  });
});

describe("paleta (median cut)", () => {
  it("separa los colores, ordena por presencia e ignora lo transparente", () => {
    const m: Muestra[] = [
      ...Array.from({ length: 60 }, (): Muestra => [255, 61, 129, 255]),
      ...Array.from({ length: 30 }, (): Muestra => [20, 20, 30, 255]),
      ...Array.from({ length: 10 }, (): Muestra => [255, 179, 71, 255]),
    ];
    const datos = new Uint8Array([...m.flatMap((x) => x), 0, 255, 0, 0]); // un píxel verde transparente
    const p = paleta(muestrasRgba(datos));
    expect(p.map((c) => c.hex)).toEqual(["#ff3d81", "#14141e", "#ffb347"]);
    expect(p[0]!.parte).toBeCloseTo(0.6, 5);
  });
  it("una imagen de un solo color da un solo color", () => {
    expect(paleta(Array.from({ length: 50 }, (): Muestra => [10, 200, 90, 255]))).toEqual([{ hex: "#0ac85a", parte: 1 }]);
  });
  it("propone los roles de la marca e ignora blancos y negros", () => {
    const r = proponerRoles([
      { hex: "#ffffff", parte: 0.5 },
      { hex: "#ff3d81", parte: 0.3 },
      { hex: "#101018", parte: 0.1 },
      { hex: "#ffd23f", parte: 0.1 },
    ]);
    expect(r.acento1).toBe("#ff3d81");
    expect(r.acento2).toBe("#ffd23f");
    expect(r.activa).toBeDefined();
    expect(contrastePeor(r.activa!, "rgba(8, 8, 18, 0.62)")!).toBeGreaterThanOrEqual(3);
    expect(proponerRoles([{ hex: "#ffffff", parte: 1 }])).toEqual({});
  });
});

describe("paleta de un archivo", () => {
  it("lee un PNG y un SVG con ffmpeg", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "geeper-paleta-test-"));
    try {
      const svg = path.join(dir, "logo.svg");
      await fs.writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="70" fill="#ff3d81"/><rect y="70" width="100" height="30" fill="#ffb347"/></svg>');
      const r = await paletaDeArchivo(svg);
      expect(r.colores[0]!.hex).toBe("#ff3d81");
      expect(r.colores.some((c) => c.hex === "#ffb347")).toBe(true);
      expect(r.roles.acento1).toBe("#ff3d81");
      await expect(paletaDeArchivo(path.join(dir, "no-existe.png"))).rejects.toThrow(/No se pudo leer/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
