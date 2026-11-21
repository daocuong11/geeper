import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aplicarParchesWan2gp, PARCHES } from "@/lib/parches-wan2gp";

async function wanFalso(contenido: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wan-"));
  const p = PARCHES[0]!;
  await fs.mkdir(path.dirname(path.join(dir, p.archivo)), { recursive: true });
  await fs.writeFile(path.join(dir, p.archivo), contenido);
  return { dir, ruta: path.join(dir, p.archivo) };
}

describe("parches de Wan2GP", () => {
  it("aplica el arreglo de InfiniteTalk una sola vez", async () => {
    const p = PARCHES[0]!;
    const { dir, ruta } = await wanFalso(`class X:\n    def rows(self):\n${p.antes}\n`);
    expect(await aplicarParchesWan2gp(dir)).toEqual([p.id]);
    expect(await fs.readFile(ruta, "utf8")).toContain(".to(table.device)");
    expect(await aplicarParchesWan2gp(dir)).toEqual([]);
    expect((await fs.readFile(ruta, "utf8")).match(/indices-cpu/g)).toHaveLength(1);
  });

  it("si Wan2GP cambió ese código, no toca nada y lo avisa", async () => {
    const { dir, ruta } = await wanFalso("otra cosa\n");
    const log: string[] = [];
    expect(await aplicarParchesWan2gp(dir, (l) => log.push(l))).toEqual([]);
    expect(await fs.readFile(ruta, "utf8")).toBe("otra cosa\n");
    expect(log.join(" ")).toMatch(/no se tocó/);
  });
});
