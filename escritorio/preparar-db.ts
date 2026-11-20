/**
 * Corre una vez en cada arranque de la app de escritorio, antes del servidor y el worker: crea la carpeta
 * de datos, crea o completa las tablas (esquema.sql, generado de prisma/schema.prisma al empaquetar, con
 * IF NOT EXISTS: repetirlo no hace nada y una versión nueva suma sus tablas) y siembra lo mismo que
 * `pnpm run setup` (plantillas iniciales y la clave de cifrado de los tokens).
 *
 * Límite conocido: agregar una columna a una tabla existente necesita una migración (ver docs/ESCRITORIO.md).
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { db } from "../src/lib/db";
import { PLANTILLAS_INICIALES } from "../src/lib/plantillas";
import { existeClave, obtenerClave } from "../src/lib/redes/cifrado";
import { dirDatos, RAIZ_REPO, rutaBaseDatos } from "../src/lib/rutas";
import { idempotente } from "./sql";

async function main() {
  fs.mkdirSync(dirDatos(), { recursive: true });
  const sql = idempotente(fs.readFileSync(path.join(RAIZ_REPO, "esquema.sql"), "utf8"));
  const base = new Database(rutaBaseDatos());
  try {
    base.pragma("journal_mode = WAL");
    base.exec(sql);
  } finally {
    base.close();
  }
  for (const p of PLANTILLAS_INICIALES) await db.plantilla.upsert({ where: { slug: p.slug }, create: p, update: {} });
  if (!existeClave()) obtenerClave();
  await db.$disconnect();
  console.log(`Base lista en ${rutaBaseDatos()}`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
