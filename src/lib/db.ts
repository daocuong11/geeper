import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { rutaBaseDatos } from "./rutas";

const global_ = globalThis as unknown as { __geeperDb?: PrismaClient };

function crear(): PrismaClient {
  const ruta = rutaBaseDatos();
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  // WAL: la web lee mientras el worker escribe; busy_timeout evita «database is locked».
  const adapter = new PrismaBetterSqlite3({ url: `file:${ruta}`, timeout: 10_000 });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = global_.__geeperDb ?? crear();
if (process.env.NODE_ENV !== "production") global_.__geeperDb = db;

let walListo = false;
export async function prepararDb(): Promise<void> {
  if (walListo) return;
  await db.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
  await db.$queryRawUnsafe("PRAGMA busy_timeout=10000;");
  walListo = true;
}
