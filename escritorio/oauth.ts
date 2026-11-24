/** ¿Es la vuelta del OAuth (el redirect URI registrado en la red: localhost:3300/api/cuentas/callback/…)? */
export function esVueltaOAuth(destino: string): boolean {
  try {
    const u = new URL(destino);
    return u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname) && u.pathname.startsWith("/api/cuentas/callback/");
  } catch {
    return false;
  }
}
