import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { idempotente } from "../escritorio/sql";

describe("app de escritorio: base de datos", () => {
  it("el esquema de Prisma se aplica dos veces sin error y crea todas las tablas", () => {
    const sql = execFileSync("npx", ["prisma", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], { encoding: "utf8" });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "esquema-"));
    const base = new Database(path.join(dir, "g.db"));
    try {
      const listo = idempotente(sql.slice(sql.indexOf("--")));
      base.exec(listo);
      base.exec(listo); // el segundo arranque no rompe nada
      const tablas = base.prepare("select name from sqlite_master where type='table'").all().map((r) => (r as { name: string }).name);
      expect(tablas).toEqual(expect.arrayContaining(["Plantilla", "Proyecto", "Trabajo", "Campana"]));
    } finally {
      base.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
