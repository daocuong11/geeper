/** Cuentas conectadas en la base: los tokens entran cifrados y sólo se descifran en memoria. */
import type { Cuenta } from "@/generated/prisma/client";
import { db } from "../db";
import { cifrar, descifrar, ErrorClave } from "./cifrado";
import { obtenerRed } from "./index";
import { registrarSecreto, tapar } from "./secretos";
import { ErrorRed, type CuentaDescifrada, type CuentaNueva, type IdRed, type Tokens } from "./tipos";

/** Lo que se puede mostrar de una cuenta (sin tokens). */
export function cuentaPublica(c: Cuenta) {
  return {
    id: c.id,
    red: c.red,
    externoId: c.externoId,
    usuario: c.usuario,
    alias: c.alias,
    avatarUrl: c.avatarUrl,
    estado: c.estado,
    scopes: c.scopes,
    expira: c.expira,
    plantilla: c.plantilla,
    error: c.error,
    creado: c.creado,
    actualizado: c.actualizado,
  };
}
export type CuentaPublica = ReturnType<typeof cuentaPublica>;

function datosTokens(t: Tokens) {
  return {
    accesoCifrado: cifrar(t.acceso),
    ...(t.refresco !== undefined ? { refrescoCifrado: t.refresco ? cifrar(t.refresco) : null } : {}),
    expira: t.expira ?? null,
    ...(t.scopes !== undefined ? { scopes: t.scopes } : {}),
  };
}

/** Crea o actualiza las cuentas que trajo un login (reconectar = misma red y mismo id externo). */
export async function guardarCuentas(red: IdRed, nuevas: CuentaNueva[]): Promise<Cuenta[]> {
  const out: Cuenta[] = [];
  for (const n of nuevas) {
    const datos = { usuario: n.usuario, avatarUrl: n.avatarUrl ?? null, estado: "conectada", error: null, ...datosTokens(n.tokens) };
    out.push(
      await db.cuenta.upsert({
        where: { red_externoId: { red, externoId: n.externoId } },
        create: { red, externoId: n.externoId, ...datos, scopes: n.tokens.scopes ?? "" },
        update: datos,
      }),
    );
  }
  return out;
}

export function descifrarCuenta(c: Cuenta): CuentaDescifrada {
  if (!c.accesoCifrado) throw new ErrorRed("auth", "La cuenta no tiene tokens: reconéctala");
  const acceso = descifrar(c.accesoCifrado);
  const refresco = c.refrescoCifrado ? descifrar(c.refrescoCifrado) : null;
  registrarSecreto(acceso);
  registrarSecreto(refresco);
  return { id: c.id, red: c.red as IdRed, externoId: c.externoId, usuario: c.usuario, acceso, refresco, expira: c.expira, scopes: c.scopes };
}

export async function marcarReconectar(id: string, motivo: string) {
  await db.cuenta.update({ where: { id }, data: { estado: "reconectar", error: tapar(motivo).slice(0, 1000) } });
}

/** Refresca y guarda (cifrado) el token nuevo. Si no se puede, la cuenta pasa a «reconectar». */
export async function refrescarCuenta(c: CuentaDescifrada): Promise<CuentaDescifrada> {
  const red = obtenerRed(c.red);
  let t: Tokens;
  try {
    t = await red.refrescar(c);
  } catch (e) {
    if (e instanceof ErrorRed && e.tipo !== "auth") throw e; // un corte de red no es un permiso vencido
    await marcarReconectar(c.id, e instanceof Error ? e.message : String(e));
    throw new ErrorRed("auth", `El permiso de ${red.nombre} venció o fue revocado: reconecta la cuenta en Cuentas`);
  }
  const fila = await db.cuenta.update({ where: { id: c.id }, data: { ...datosTokens(t), estado: "conectada", error: null } });
  return descifrarCuenta(fila);
}

/** Cuenta lista para usar: conectada, descifrada y con el token vigente al menos `margen`. */
export async function cuentaLista(id: string): Promise<CuentaDescifrada> {
  const fila = await db.cuenta.findUniqueOrThrow({ where: { id } });
  if (fila.estado !== "conectada") throw new ErrorRed("auth", `La cuenta ${fila.alias ?? fila.usuario} está «${fila.estado}»: reconéctala en Cuentas`);
  let c: CuentaDescifrada;
  try {
    c = descifrarCuenta(fila);
  } catch (e) {
    if (e instanceof ErrorClave) await marcarReconectar(id, e.message);
    throw e;
  }
  const margen = obtenerRed(c.red).margenRefresco ?? 5 * 60_000;
  if (c.expira && c.expira.getTime() - Date.now() < margen) c = await refrescarCuenta(c);
  return c;
}

/**
 * Corre `fn` con la cuenta; ante un 401 refresca una vez y reintenta. Si vuelve a fallar por
 * permiso, la cuenta pasa a «reconectar».
 */
export async function conCuenta<T>(c: CuentaDescifrada, fn: (c: CuentaDescifrada) => Promise<T>): Promise<{ valor: T; cuenta: CuentaDescifrada }> {
  try {
    return { valor: await fn(c), cuenta: c };
  } catch (e) {
    if (!(e instanceof ErrorRed) || e.tipo !== "auth") throw e;
  }
  const nueva = await refrescarCuenta(c);
  try {
    return { valor: await fn(nueva), cuenta: nueva };
  } catch (e) {
    if (e instanceof ErrorRed && e.tipo === "auth") await marcarReconectar(c.id, e.message);
    throw e;
  }
}

/** Revoca en la red (si se puede), borra los tokens y deja el historial. */
export async function desconectar(id: string): Promise<void> {
  const fila = await db.cuenta.findUniqueOrThrow({ where: { id } });
  const red = obtenerRed(fila.red);
  if (red.revocar && fila.accesoCifrado) {
    try {
      await red.revocar(descifrarCuenta(fila));
    } catch {
      /* se desconecta igual: el token se borra de la base */
    }
  }
  await db.cuenta.update({ where: { id }, data: { estado: "desconectada", accesoCifrado: null, refrescoCifrado: null, expira: null, error: null } });
}
