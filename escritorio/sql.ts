/** El SQL de `prisma migrate diff --from-empty`, vuelto idempotente (se corre en cada arranque de la app). */
export function idempotente(sql: string): string {
  return sql
    .replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "')
    .replace(/CREATE (UNIQUE )?INDEX "/g, (_m, u: string | undefined) => `CREATE ${u ?? ""}INDEX IF NOT EXISTS "`);
}
