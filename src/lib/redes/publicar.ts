/**
 * Ejecutor de `publicar.subir` (PUBLICAR.md §9). Cada etapa es idempotente y guarda su avance en el
 * payload, así un reinicio retoma la misma sesión de subida y nunca publica dos veces.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { sha256Archivo } from "../archivos";
import { Espera, type Payload } from "../cola";
import { db } from "../db";
import { dirProyecto } from "../rutas";
import { conCuenta, cuentaLista } from "./cuentas";
import { admite, obtenerRed } from "./index";
import { verificarSalida } from "./salida";
import { tapar } from "./secretos";
import { ErrorRed, type ArchivoVideo, type CuentaDescifrada, type MetaPublicacion, type Perfil, type Privacidad, type Sesion } from "./tipos";

export interface CtxPublicar {
  log: (linea: string) => void;
  etapa: (e: string, progreso: number) => Promise<void>;
  guardar: (payload: Payload) => Promise<void>;
  signal: AbortSignal;
}

export interface PayloadPublicar extends Payload {
  publicacionId: string;
  sesion?: Sesion | null;
  bytesConfirmados?: number;
  subido?: boolean;
  cerrada?: boolean;
  /** Hora en que se llamó a `publicar` (Instagram), para reconocer lo publicado tras un corte. */
  publicando?: string;
  publicado?: { idExterno: string; url: string | null; borrador: boolean } | null;
  /** Cortes de red seguidos (se espera y se reintenta sin gastar intentos, hasta un tope). */
  cortes?: number;
}

export const ESPERA_VPN_MS = 60_000;
export const ESPERA_CORTE_MS = 2 * 60_000;
export const MAX_CORTES = 6;
export const SONDEO_MS = 10_000;
export const MAX_PROCESO_MS = 60 * 60_000;

const dormir = (ms: number, signal: AbortSignal) =>
  new Promise<void>((ok, mal) => {
    if (signal.aborted) return mal(new Error("Cancelado"));
    const t = setTimeout(ok, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      mal(new Error("Cancelado"));
    }, { once: true });
  });

/** Corta si el VPN no está como se espera: el trabajo vuelve a la cola sin gastar el intento. */
export async function exigirVpn(): Promise<void> {
  const v = await verificarSalida();
  if (!v.ok) throw new Espera(new Date(Date.now() + ESPERA_VPN_MS), `Esperando VPN · ${v.detalle}`);
}

const hhmm = (d: Date) => d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });

export async function publicarSubir(trabajoId: string, entrada: Payload, ctx: CtxPublicar): Promise<unknown> {
  const p = { ...entrada } as PayloadPublicar;
  if (typeof p.publicacionId !== "string") throw new Error("Falta publicacionId en el payload");
  const pub = await db.publicacion.findUniqueOrThrow({ where: { id: p.publicacionId }, include: { cuenta: true } });
  if (pub.estado === "publicada" || pub.estado === "borrador") {
    ctx.log(`La publicación ya estaba cerrada (${pub.estado}): no se vuelve a subir`);
    return { publicacionId: pub.id, idExterno: pub.idExterno, url: pub.urlExterna, retomada: true };
  }
  if (pub.estado === "cancelada") throw new Error("La publicación fue cancelada");
  const red = obtenerRed(pub.cuenta.red);
  const guardar = async () => ctx.guardar(p);

  try {
    // Verificar.
    await ctx.etapa("Verificando render, cuenta y VPN", 0.01);
    const render = await db.render.findUniqueOrThrow({ where: { id: pub.renderId }, include: { proyecto: true } });
    if (render.estado !== "aprobado") throw new Error("Sólo se publica un render aprobado por el QC");
    if (!admite(red, render.perfil)) throw new Error(`${red.nombre} no admite el formato ${render.perfil}`);
    const ruta = path.join(dirProyecto(render.proyecto.slug), render.ruta);
    const st = await fs.stat(ruta).catch(() => null);
    if (!st) throw new Error(`No encuentro el MP4 del render: ${render.ruta}`);
    const hash = await sha256Archivo(ruta);
    if (!render.hash) await db.render.update({ where: { id: render.id }, data: { hash } });
    else if (render.hash !== hash) throw new Error("El MP4 cambió desde que el QC lo aprobó: vuelve a renderizar antes de publicar");
    await exigirVpn();
    let c: CuentaDescifrada = await cuentaLista(pub.cuentaId);
    const usar = async <T>(fn: (c: CuentaDescifrada) => Promise<T>): Promise<T> => {
      const r = await conCuenta(c, fn);
      c = r.cuenta;
      return r.valor;
    };

    const archivo: ArchivoVideo = { ruta, bytes: st.size, perfil: render.perfil as Perfil, duracion: render.duracion };
    const meta: MetaPublicacion = { titulo: pub.titulo, descripcion: pub.descripcion, privacidad: pub.privacidad as Privacidad, programada: pub.programada };
    await db.publicacion.update({ where: { id: pub.id }, data: { estado: "subiendo", trabajoId, error: null } });

    if (!p.publicado) {
      // Iniciar o retomar la subida.
      if (!p.subido) {
        if (p.sesion) {
          const sesion = p.sesion;
          const r = await usar((cc) => red.bytesRecibidos(cc, sesion, archivo));
          if (!r) {
            ctx.log("La sesión de subida anterior ya no sirve: se abre otra (la anterior nunca se publicó)");
            p.sesion = null;
            p.bytesConfirmados = 0;
          } else {
            p.bytesConfirmados = r.bytes;
            if (r.idExterno) p.sesion = { ...sesion, idExterno: r.idExterno, url: r.url ?? null };
            if (r.idExterno || r.bytes >= archivo.bytes) p.subido = true;
            ctx.log(`Retomo la subida: la red tiene ${r.bytes} de ${archivo.bytes} bytes`);
          }
          await guardar();
        }
        if (!p.sesion && !p.subido) {
          await ctx.etapa(`Abriendo la subida en ${red.nombre}`, 0.03);
          p.sesion = await usar((cc) => red.iniciarSubida(cc, archivo, meta));
          p.bytesConfirmados = 0;
          await guardar(); // antes de subir: un reinicio retoma esta misma sesión
          ctx.log(`Sesión de subida abierta en ${red.nombre}`);
        }
        // Subir por tramos.
        let bytes = p.bytesConfirmados ?? 0;
        let sinAvance = 0;
        while (!p.subido && bytes < archivo.bytes) {
          if (ctx.signal.aborted) throw new Error("Cancelado");
          const sesion = p.sesion!;
          const hasta = Math.min(archivo.bytes, bytes + red.tramo(sesion, archivo));
          const r = await usar((cc) => red.subirTramo(cc, sesion, archivo, bytes, hasta));
          if (r.idExterno) p.sesion = { ...sesion, idExterno: r.idExterno, url: r.url ?? null };
          if (r.bytes <= bytes && !r.idExterno) {
            if (++sinAvance >= 3) throw new ErrorRed("red", `${red.nombre} no confirmó bytes nuevos tras 3 tramos`);
          } else sinAvance = 0;
          bytes = Math.max(bytes, r.bytes);
          p.bytesConfirmados = bytes;
          if (r.idExterno || bytes >= archivo.bytes) p.subido = true;
          p.cortes = 0;
          await guardar();
          await ctx.etapa(`Subiendo a ${red.nombre}: ${Math.round((bytes / archivo.bytes) * 100)} %`, 0.05 + 0.75 * (bytes / archivo.bytes));
        }
        p.subido = true;
        await guardar();
      }

      if (red.cerrarSubida && !p.cerrada) {
        await exigirVpn();
        const sesion = p.sesion!;
        await usar((cc) => red.cerrarSubida!(cc, sesion, meta));
        p.cerrada = true;
        await guardar();
      }

      // Procesar.
      await db.publicacion.update({ where: { id: pub.id }, data: { estado: "procesando" } });
      const t0 = Date.now();
      let q = await usar((cc) => red.consultar(cc, p.sesion!));
      while (!q.listo) {
        if (q.error) throw new ErrorRed("red", `${red.nombre} rechazó el video: ${q.error}`);
        if (Date.now() - t0 > MAX_PROCESO_MS) throw new ErrorRed("red", `${red.nombre} sigue procesando tras 60 min: relanza el trabajo más tarde`);
        await ctx.etapa(`${red.nombre} procesando${q.detalle ? `: ${q.detalle}` : ""}`, 0.85);
        await dormir(SONDEO_MS, ctx.signal);
        q = await usar((cc) => red.consultar(cc, p.sesion!));
      }
      if (q.error) throw new ErrorRed("red", `${red.nombre} rechazó el video: ${q.error}`);

      // Publicar.
      if (red.publicar) {
        await exigirVpn();
        await ctx.etapa(`Publicando en ${red.nombre}`, 0.95);
        p.publicando ??= new Date().toISOString();
        await guardar();
        const sesion = { ...p.sesion!, publicando: p.publicando };
        const r = await usar((cc) => red.publicar!(cc, sesion, meta));
        p.publicado = { idExterno: r.idExterno, url: r.url ?? null, borrador: false };
      } else {
        const id = q.idExterno ?? (typeof p.sesion?.idExterno === "string" ? p.sesion.idExterno : null);
        if (!id) throw new ErrorRed("red", `${red.nombre} terminó sin devolver el id del video`);
        const url = q.url ?? (typeof p.sesion?.url === "string" ? p.sesion.url : null);
        p.publicado = { idExterno: id, url, borrador: !!q.borrador || meta.privacidad === "borrador" };
      }
      await guardar();
    }

    // Cerrar.
    const fin = p.publicado!;
    await db.publicacion.update({
      where: { id: pub.id },
      data: { estado: fin.borrador ? "borrador" : "publicada", idExterno: fin.idExterno, urlExterna: fin.url, error: null },
    });
    ctx.log(`Listo en ${red.nombre}: ${fin.borrador ? "borrador" : "publicado"} ${fin.url ?? fin.idExterno}`);
    return { publicacionId: pub.id, idExterno: fin.idExterno, url: fin.url, borrador: fin.borrador };
  } catch (e) {
    if (e instanceof Espera) {
      await db.publicacion.update({ where: { id: pub.id }, data: { error: e.etapa } });
      throw e;
    }
    if (e instanceof ErrorRed && e.tipo === "cuota") {
      const hasta = e.hasta ?? new Date(Date.now() + 15 * 60_000);
      const etapa = `Cuota de ${red.nombre} agotada: reintenta a las ${hhmm(hasta)}`;
      ctx.log(tapar(e.message));
      await db.publicacion.update({ where: { id: pub.id }, data: { error: etapa } });
      throw new Espera(hasta, etapa);
    }
    // Corte de conexión o error 5xx: se espera y se retoma la misma sesión, hasta un tope.
    const transitorio = e instanceof ErrorRed && e.tipo === "red" && (e.status === undefined || e.status >= 500);
    if (transitorio && !ctx.signal.aborted && (p.cortes ?? 0) < MAX_CORTES) {
      p.cortes = (p.cortes ?? 0) + 1;
      await guardar();
      const etapa = `Corte con ${red.nombre} (${p.cortes}/${MAX_CORTES}): reintento en 2 min`;
      ctx.log(tapar(e.message));
      throw new Espera(new Date(Date.now() + ESPERA_CORTE_MS), etapa);
    }
    const msg = tapar(e instanceof Error ? e.message : String(e));
    await db.publicacion.update({ where: { id: pub.id }, data: ctx.signal.aborted ? { estado: "cancelada", error: "Cancelado por la persona" } : { estado: "fallida", error: msg.slice(0, 2000) } });
    throw new Error(msg);
  }
}
