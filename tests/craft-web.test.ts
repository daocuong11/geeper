import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const casa = await fs.mkdtemp(path.join(os.tmpdir(), "craft-web-"));
vi.mock("@/lib/rutas", async (orig) => ({ ...(await orig<typeof import("@/lib/rutas")>()), ESTUDIO: casa }));
const { APPS_CRAFT, appCraft, archivoWeb, prepararWeb, sinCache, tipoDe, versionWeb } = await import("@/lib/craft-web");

describe("Media: sitio web de una app Craft", () => {
  const sitio = path.join(casa, "photocraft-web", "0.23.1", "photocraft-web-0.23.1");
  beforeAll(async () => {
    await fs.mkdir(path.join(sitio, "app"), { recursive: true });
    await fs.mkdir(path.join(sitio, "snippets", "eframe-x"), { recursive: true });
    await fs.writeFile(path.join(sitio, "index.html"), "<html></html>");
    await fs.writeFile(path.join(sitio, "snippets", "eframe-x", "inline0.js"), "export {}");
    await fs.writeFile(path.join(casa, "secreto.txt"), "no");
    await fs.symlink(path.join(casa, "secreto.txt"), path.join(sitio, "fuera.txt"));
    await fs.symlink(sitio, path.join(casa, "photocraft-web", "actual"));
  });
  afterAll(() => fs.rm(casa, { recursive: true, force: true }));

  it("lee la versión instalada del enlace `actual`", async () => {
    expect(await versionWeb("photocraft")).toBe("0.23.1");
    expect(await versionWeb("filmcraft")).toBeNull();
  });

  it("sirve sólo archivos de su carpeta", async () => {
    expect(await archivoWeb("photocraft", ["index.html"])).toBe(path.join(await fs.realpath(sitio), "index.html"));
    expect(await archivoWeb("photocraft", ["..", "..", "secreto.txt"])).toBeNull();
    expect(await archivoWeb("photocraft", ["fuera.txt"])).toBeNull(); // enlace que sale de la carpeta
    expect(await archivoWeb("photocraft", ["app"])).toBeNull(); // carpeta, no archivo
    expect(await archivoWeb("photocraft", ["no-existe.js"])).toBeNull();
    expect(await archivoWeb("photocraft", ["a\\..\\b"])).toBeNull();
  });

  it("copia snippets/ a app/snippets/ (el JS de la app los pide ahí)", async () => {
    await prepararWeb(sitio);
    expect(await fs.readFile(path.join(sitio, "app", "snippets", "eframe-x", "inline0.js"), "utf8")).toBe("export {}");
    await prepararWeb(sitio); // otra vez no falla
  });

  it("tipos y caché: wasm con su tipo, partes tal cual, nombres fijos sin caché", () => {
    expect(tipoDe("x_bg.wasm")).toBe("application/wasm");
    expect(tipoDe("app/photocraft-web-caa57f60c12c8283.part-aa")).toBe("application/octet-stream");
    expect(sinCache("index.html")).toBe(true);
    expect(sinCache("app/parts.txt")).toBe(true);
    expect(sinCache("app/photocraft-web.js")).toBe(true);
    expect(sinCache("app/photocraft-web-caa57f60c12c8283.part-aa")).toBe(false);
    expect(sinCache("photocraft-web-boot-f1b57f4718fcff8_bg.wasm")).toBe(false);
  });

  it("el catálogo no repite apps y las de sólo escritorio no se abren", () => {
    expect(new Set(APPS_CRAFT.map((a) => a.app)).size).toBe(APPS_CRAFT.length);
    expect(appCraft("anicraft")).toBeNull();
    expect(appCraft("photocraft")?.nombre).toBe("PhotoCraft");
    expect(appCraft("../etc")).toBeNull();
  });
});
