import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#f00"/></svg>';
const aSvg = vi.fn(async () => ({ svg: Buffer.from(SVG), avisos: ["faltaba la fuente Foo"] }));
vi.mock("@/lib/vectorcraft", () => ({ aSvg }));

const { guardarImagenSubida } = await import("@/lib/imagen-subida");

describe("guardarImagenSubida con logos vectoriales", () => {
  let dir: string;
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "imagen-subida-")); aSvg.mockClear(); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it("convierte un .pdf a SVG, lo revisa y lo guarda como .svg con los avisos", async () => {
    const r = await guardarImagenSubida(new File([Buffer.from("%PDF-1.7")], "logo.pdf"), dir, "logo");
    expect(aSvg).toHaveBeenCalledOnce();
    expect(r.nombre).toMatch(/^logo-[0-9a-f]{12}\.svg$/);
    expect(await fs.readFile(r.abs, "utf8")).toBe(SVG);
    expect(r.avisos).toEqual(["faltaba la fuente Foo"]);
  });

  it("rechaza el SVG convertido si trae scripts", async () => {
    aSvg.mockResolvedValueOnce({ svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), avisos: [] });
    await expect(guardarImagenSubida(new File([Buffer.from("x")], "logo.ai"), dir, "logo")).rejects.toThrow();
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("un PNG no pasa por VectorCraft y un formato raro se rechaza", async () => {
    const r = await guardarImagenSubida(new File([Buffer.from("png")], "a.png"), dir, "img");
    expect(r.nombre.endsWith(".png")).toBe(true);
    expect(aSvg).not.toHaveBeenCalled();
    await expect(guardarImagenSubida(new File([Buffer.from("x")], "a.exe"), dir, "img")).rejects.toThrow(/Formato no admitido/);
  });
});
