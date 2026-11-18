/** Cola con esperas y ejecutor de publicar.subir con una red falsa (sin internet). */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Red, Sesion } from "@/lib/redes/tipos";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geeper-publicar-"));
process.env.GEEPER_DATA = dir;
process.env.GEEPER_DB = path.join(dir, "prueba.db");
process.env.GEEPER_CONFIG = path.join(dir, "config");

type Cola = typeof import("@/lib/cola");
let cola: Cola;
let db: typeof import("@/lib/db")["db"];
let publicar: typeof import("@/lib/redes/publicar");
let redes: typeof import("@/lib/redes/index");
let cuentas: typeof import("@/lib/redes/cuentas");
let salida: typeof import("@/lib/redes/salida");
let ErrorRed: typeof import("@/lib/redes/tipos")["ErrorRed"];

const TAM = 20;
const llamadas: string[] = [];
let recibidos = 0;
let cortarEn: number | null = null;
let publicado = false;

const falsa: Red = {
  id: "youtube",
  nombre: "Falsa",
  formatos: ["shorts-9x16"],
  privacidades: ["privado"],
  programar: false,
  pkce: true,
  urlConexion: () => "https://ejemplo",
  canjear: async () => [],
  refrescar: async () => ({ acceso: "nuevo-acceso-123", expira: new Date(Date.now() + 3600_000) }),
  tramo: () => 8,
  iniciarSubida: async () => {
    llamadas.push("iniciar");
    recibidos = 0;
    return { url: "sesion-1" } satisfies Sesion;
  },
  bytesRecibidos: async () => {
    llamadas.push(`consultar-bytes:${recibidos}`);
    return { bytes: recibidos };
  },
  subirTramo: async (_c, _s, _a, desde, hasta) => {
    if (cortarEn !== null && desde >= cortarEn) {
      cortarEn = null;
      throw new ErrorRed("red", "se cortó la conexión");
    }
    llamadas.push(`tramo:${desde}-${hasta}`);
    if (desde !== recibidos) throw new Error(`tramo fuera de orden: ${desde} != ${recibidos}`);
    recibidos = hasta;
    return hasta === TAM ? { bytes: hasta, idExterno: "vid-1", url: "https://ejemplo/vid-1" } : { bytes: hasta };
  },
  consultar: async (_c, s) => ({ listo: true, idExterno: String(s.idExterno) }),
};

function ctx(payloadRef: { p: Record<string, unknown> }) {
  return {
    log: () => undefined,
    etapa: async () => undefined,
    signal: new AbortController().signal,
    guardar: async (p: Record<string, unknown>) => {
      payloadRef.p = p;
    },
  };
}

beforeAll(async () => {
  execFileSync(path.join(process.cwd(), "node_modules", ".bin", "prisma"), ["db", "push"], { env: process.env, stdio: "ignore" });
  cola = await import("@/lib/cola");
  db = (await import("@/lib/db")).db;
  publicar = await import("@/lib/redes/publicar");
  redes = await import("@/lib/redes/index");
  cuentas = await import("@/lib/redes/cuentas");
  salida = await import("@/lib/redes/salida");
  ErrorRed = (await import("@/lib/redes/tipos")).ErrorRed;
  redes.usarRed("youtube", falsa);
  salida.usarMedidor(async () => ({ ip: "203.0.113.7", pais: "AR", fuente: "prueba", medido: new Date().toISOString() }));

  await db.proyecto.create({ data: { id: "p1", slug: "p1", nombre: "Proyecto", tema: "t", formato: "9:16", plantilla: "x" } });
  fs.mkdirSync(path.join(dir, "p1", "renders"), { recursive: true });
  fs.writeFileSync(path.join(dir, "p1", "renders", "v1.mp4"), Buffer.alloc(TAM, 7));
  await db.render.create({ data: { id: "r1", proyectoId: "p1", versionNumero: 1, perfil: "shorts-9x16", ruta: "renders/v1.mp4", estado: "aprobado" } });
  const [c] = await cuentas.guardarCuentas("youtube", [{ externoId: "canal-1", usuario: "@canal", tokens: { acceso: "acceso-viejo-123", refresco: "refresco-123", expira: new Date(Date.now() + 3600_000), scopes: "x" } }]);
  await db.cuenta.update({ where: { id: c!.id }, data: { id: "c1" } });
}, 60_000);

beforeEach(async () => {
  llamadas.length = 0;
  recibidos = 0;
  cortarEn = null;
  publicado = false;
  void publicado;
  await db.publicacion.deleteMany();
  await db.publicacion.create({ data: { id: "pub1", proyectoId: "p1", renderId: "r1", cuentaId: "c1", titulo: "Hola", descripcion: "d", privacidad: "privado" } });
  await salida.guardarAjustes({ vpn: "apagado", ipEsperada: "", paisEsperado: "" });
  salida.usarMedidor(async () => ({ ip: "203.0.113.7", pais: "AR", fuente: "prueba", medido: new Date().toISOString() }));
});

describe("cola: esperas sin gastar intentos", () => {
  it("esperar devuelve a la cola, no suma el intento y reclamar respeta noAntesDe", async () => {
    await db.trabajo.deleteMany();
    const t = await cola.encolar("p1", "publicar.subir", { publicacionId: "x" });
    const r = await cola.reclamar("red", "w1");
    expect(r?.intentos).toBe(1);
    expect(await cola.esperar(t.id, "w1", new Date(Date.now() + 60_000), "Esperando VPN")).toBe(true);
    const fila = await db.trabajo.findUniqueOrThrow({ where: { id: t.id } });
    expect(fila.estado).toBe("pendiente");
    expect(fila.intentos).toBe(0);
    expect(fila.etapa).toBe("Esperando VPN");
    expect(await cola.reclamar("red", "w1")).toBeNull();
    await db.trabajo.update({ where: { id: t.id }, data: { noAntesDe: new Date(Date.now() - 1000) } });
    expect((await cola.reclamar("red", "w1"))?.id).toBe(t.id);
  });
});

describe("publicar.subir", () => {
  it("sube por tramos, guarda el hash del render y cierra la publicación", async () => {
    const ref = { p: { publicacionId: "pub1" } as Record<string, unknown> };
    const r = await publicar.publicarSubir("t1", ref.p, ctx(ref));
    expect(r).toMatchObject({ idExterno: "vid-1" });
    expect(llamadas).toEqual(["iniciar", "tramo:0-8", "tramo:8-16", "tramo:16-20"]);
    const pub = await db.publicacion.findUniqueOrThrow({ where: { id: "pub1" } });
    expect(pub).toMatchObject({ estado: "publicada", idExterno: "vid-1", urlExterna: "https://ejemplo/vid-1" });
    expect((await db.render.findUniqueOrThrow({ where: { id: "r1" } })).hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("un corte a mitad espera y al retomar sigue desde los bytes confirmados, sin otra sesión", async () => {
    cortarEn = 8;
    const ref = { p: { publicacionId: "pub1" } as Record<string, unknown> };
    await expect(publicar.publicarSubir("t1", ref.p, ctx(ref))).rejects.toMatchObject({ name: "Espera" });
    expect(ref.p).toMatchObject({ bytesConfirmados: 8, cortes: 1 });
    await publicar.publicarSubir("t1", ref.p, ctx(ref));
    expect(llamadas).toEqual(["iniciar", "tramo:0-8", "consultar-bytes:8", "tramo:8-16", "tramo:16-20"]);
    expect((await db.publicacion.findUniqueOrThrow({ where: { id: "pub1" } })).estado).toBe("publicada");
  });

  it("si el payload ya tiene lo publicado, no vuelve a subir ni a publicar", async () => {
    const ref = { p: { publicacionId: "pub1", publicado: { idExterno: "vid-9", url: null, borrador: false } } as Record<string, unknown> };
    await publicar.publicarSubir("t1", ref.p, ctx(ref));
    expect(llamadas).toEqual([]);
    expect((await db.publicacion.findUniqueOrThrow({ where: { id: "pub1" } })).idExterno).toBe("vid-9");
  });

  it("con el VPN requerido y otra IP, espera sin tocar la red", async () => {
    await salida.guardarAjustes({ vpn: "requerido", paisEsperado: "US" });
    salida.usarMedidor(async () => ({ ip: "198.51.100.1", pais: "AR", fuente: "prueba", medido: new Date().toISOString() }));
    const ref = { p: { publicacionId: "pub1" } as Record<string, unknown> };
    await expect(publicar.publicarSubir("t1", ref.p, ctx(ref))).rejects.toMatchObject({ name: "Espera", etapa: expect.stringMatching(/Esperando VPN/) });
    expect(llamadas).toEqual([]);
  });

  it("no publica si el MP4 cambió después de aprobarse", async () => {
    await db.render.update({ where: { id: "r1" }, data: { hash: "0".repeat(64) } });
    const ref = { p: { publicacionId: "pub1" } as Record<string, unknown> };
    await expect(publicar.publicarSubir("t1", ref.p, ctx(ref))).rejects.toThrow(/cambió/);
    expect((await db.publicacion.findUniqueOrThrow({ where: { id: "pub1" } })).estado).toBe("fallida");
    await db.render.update({ where: { id: "r1" }, data: { hash: null } });
  });

  it("un 401 refresca una vez; si vuelve a fallar, la cuenta pasa a reconectar", async () => {
    const orig = falsa.iniciarSubida;
    falsa.iniciarSubida = async () => {
      throw new ErrorRed("auth", "HTTP 401");
    };
    try {
      const ref = { p: { publicacionId: "pub1" } as Record<string, unknown> };
      await expect(publicar.publicarSubir("t1", ref.p, ctx(ref))).rejects.toThrow(/401/);
      expect((await db.cuenta.findUniqueOrThrow({ where: { id: "c1" } })).estado).toBe("reconectar");
      const pub = await db.publicacion.findUniqueOrThrow({ where: { id: "pub1" } });
      expect(pub.estado).toBe("fallida");
      // El token refrescado se guardó cifrado, nunca en claro.
      const fila = await db.cuenta.findUniqueOrThrow({ where: { id: "c1" } });
      expect(fila.accesoCifrado).not.toContain("nuevo-acceso");
    } finally {
      falsa.iniciarSubida = orig;
      await db.cuenta.update({ where: { id: "c1" }, data: { estado: "conectada", error: null } });
    }
  });
});
