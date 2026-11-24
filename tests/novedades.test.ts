import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compararVersiones, consultar, leerFuentes, marcarRevisada, tieneNovedades, type Fuente } from "@/lib/novedades";

const base: Fuente = { id: "vectorcraft", repo: "storytold/vectorcraft", tipo: "release", como: ["binario", "codigo"], version: "0.24.1", commit: "54f58ff", revisado: "2026-11-19", que: "x" };

describe("novedades de los repos integrados", () => {
  it("el registro del repo es válido y no repite fuentes", async () => {
    const fuentes = await leerFuentes();
    expect(new Set(fuentes.map((f) => f.id)).size).toBe(fuentes.length);
    expect(fuentes.map((f) => f.id)).toEqual(expect.arrayContaining(["photocraft", "vectorcraft", "filmcraft", "effectcraft", "hyperframes", "claude-ads"]));
    // Los archivos que dice que dependen de cada fuente existen (si se mueven, el registro miente).
    for (const f of fuentes) for (const a of f.archivos ?? []) await expect(fs.access(path.join(process.cwd(), a))).resolves.toBeUndefined();
  });

  it("compara versiones por número, no como texto", () => {
    expect(compararVersiones("0.24.10", "0.24.9")).toBeGreaterThan(0);
    expect(compararVersiones("v0.25.0", "0.24.1")).toBeGreaterThan(0);
    expect(compararVersiones("0.24.1", "v0.24.1")).toBe(0);
  });

  it("lista sólo releases más nuevas (sin borradores ni previas) y commits posteriores al revisado", async () => {
    const pedidas: string[] = [];
    const pedir = async (url: string) => {
      pedidas.push(url);
      if (url.includes("/releases")) {
        return [
          { tag_name: "v0.25.0", published_at: "2026-11-25T10:00:00Z", html_url: "u25", body: "Arreglos" },
          { tag_name: "v0.26.0-rc1", published_at: "2026-11-26T10:00:00Z", html_url: "rc", prerelease: true },
          { tag_name: "v0.24.1", published_at: "2026-11-12T10:00:00Z", html_url: "u241" },
        ];
      }
      return [
        { sha: "aaaaaaa1111", html_url: "c1", commit: { message: "fix: trazo\n\ndetalle", committer: { date: "2026-11-21T00:00:00Z" } } },
        { sha: "54f58ff2222", html_url: "c0", commit: { message: "el revisado", committer: { date: "2026-11-19T00:00:00Z" } } },
      ];
    };
    const n = await consultar(base, pedir);
    expect(n.nuevas.map((r) => r.version)).toEqual(["0.25.0"]);
    expect(n.commits).toEqual([{ sha: "aaaaaaa", fecha: "2026-11-21", mensaje: "fix: trazo", url: "c1" }]);
    expect(pedidas[1]).toContain("since=2026-11-19T00%3A00%3A00Z");
    expect(tieneNovedades(n)).toBe(true);
  });

  it("un error de red queda en la fuente y no frena a las demás", async () => {
    const n = await consultar(base, async () => {
      throw new Error("sin red");
    });
    expect(n.error).toBe("sin red");
    expect(tieneNovedades(n)).toBe(false);
  });

  it("npm: versiones publicadas después de la fijada", async () => {
    const f: Fuente = { id: "hyperframes", repo: "heygen-com/hyperframes", tipo: "npm", paquete: "hyperframes", como: ["binario"], version: "0.9.27", revisado: "2026-11-19", que: "x" };
    const n = await consultar(f, async () => ({ time: { created: "2025-01-01", "0.9.27": "2026-10-01T00:00:00Z", "0.9.72": "2026-11-20T00:00:00Z", "1.0.0-beta.1": "2026-11-20T00:00:00Z" } }));
    expect(n.nuevas.map((r) => r.version)).toEqual(["0.9.72"]);
  });

  it("marcar revisada mueve la base y deja el JSON válido", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fuentes-"));
    try {
      const archivo = path.join(dir, "fuentes.json");
      await fs.writeFile(archivo, JSON.stringify({ fuentes: [base] }));
      const f = await marcarRevisada("vectorcraft", { version: "v0.25.0", commit: "aaaaaaa", hoy: "2026-11-25" }, archivo);
      expect(f).toMatchObject({ version: "0.25.0", commit: "aaaaaaa", revisado: "2026-11-25" });
      expect((await leerFuentes(archivo))[0]!.version).toBe("0.25.0");
      await expect(marcarRevisada("no-existe", {}, archivo)).rejects.toThrow(/No hay una fuente/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("fuentes archivadas", () => {
  it("gtavi-claudecode queda archivada (el autor borró el repo) con su motivo", async () => {
    const { leerFuentes } = await import("@/lib/novedades");
    const g = (await leerFuentes()).find((f) => f.id === "gtavi-claudecode");
    expect(g?.archivada?.motivo).toMatch(/borró el repo/);
    expect(g?.commit).toBe("dd95d39");
  });
});
