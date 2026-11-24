import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { aOtio, rutasParaWindows } from "@/lib/otio";
import { carpetaVisible, paqueteEditor } from "@/lib/paquete-editor";
import { proyectoDePrueba } from "./fixtures";

const urls = (o: unknown): string[] => JSON.stringify(o).match(/"target_url":"[^"]+"/g) ?? [];

describe("paquete para otro editor", () => {
  it("pasa las rutas a la carpeta de red de WSL sin tocar el original", () => {
    const base = aOtio(proyectoDePrueba(), "/home/yo/geeper-data/mi proyecto");
    const win = rutasParaWindows(base, "Ubuntu-24.04");
    expect(urls(win).length).toBeGreaterThan(0);
    for (const u of urls(win)) expect(u).toMatch(/^"target_url":"file:\/\/wsl\.localhost\/Ubuntu-24\.04\/home\/yo\/geeper-data\/mi%20proyecto\//);
    for (const u of urls(base)) expect(u).toMatch(/^"target_url":"file:\/\/\/home\//);
  });

  it("el .zip trae el .otio, el .srt y la guía con la carpeta de Windows", () => {
    const zip = unzipSync(paqueteEditor(proyectoDePrueba(), "prueba", "/home/yo/geeper-data/prueba", "Ubuntu-24.04"));
    expect(Object.keys(zip).sort()).toEqual(["LEEME.txt", "prueba.otio", "prueba.srt"]);
    const otio = JSON.parse(strFromU8(zip["prueba.otio"]!));
    expect(urls(otio).every((u) => u.includes("wsl.localhost"))).toBe(true);
    expect(strFromU8(zip["prueba.srt"]!)).toMatch(/^1\r?\n\d\d:\d\d:\d\d,\d{3} --> /);
    const guia = strFromU8(zip["LEEME.txt"]!);
    expect(guia).toContain("\\\\wsl.localhost\\Ubuntu-24.04\\home\\yo\\geeper-data\\prueba");
    expect(guia).toContain("Archivo ▸ Importar…");
    expect(guia).not.toContain("/home/yo");
  });

  it("fuera de WSL deja las rutas de Linux", () => {
    expect(carpetaVisible("/home/yo/x", undefined)).toBe("/home/yo/x");
    const zip = unzipSync(paqueteEditor(proyectoDePrueba(), "p", "/home/yo/x", ""));
    expect(urls(JSON.parse(strFromU8(zip["p.otio"]!))).every((u) => u.includes("file:///home/yo/x"))).toBe(true);
  });
});
