/**
 * Adaptadores de YouTube y TikTok con fetch simulado: nunca se llama a las redes reales.
 * Las credenciales son falsas y viven en un GEEPER_CONFIG temporal.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ArchivoVideo, CuentaDescifrada, MetaPublicacion, Red, Sesion } from "../src/lib/redes/tipos";

const MiB = 1024 * 1024;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geeper-redes-"));
const antes = { config: process.env.GEEPER_CONFIG, url: process.env.GEEPER_URL };

function escribirConfig(publicacionDirecta: boolean) {
  fs.writeFileSync(
    path.join(dir, "redes.json"),
    JSON.stringify({
      youtube: { clientId: "cliente-yt-falso", clientSecret: "secreto-yt-falso" },
      tiktok: { clientKey: "clave-tt-falsa", clientSecret: "secreto-tt-falso", publicacionDirecta },
    }),
  );
}

let youtube: Red;
let tiktok: Red;
let yt: typeof import("../src/lib/redes/youtube");
let tt: typeof import("../src/lib/redes/tiktok");
let ErrorRed: typeof import("../src/lib/redes/tipos").ErrorRed;

beforeAll(async () => {
  process.env.GEEPER_CONFIG = dir;
  delete process.env.GEEPER_URL;
  escribirConfig(false);
  yt = await import("../src/lib/redes/youtube");
  tt = await import("../src/lib/redes/tiktok");
  ({ ErrorRed } = await import("../src/lib/redes/tipos"));
  youtube = yt.youtube;
  tiktok = tt.tiktok;
});

afterEach(() => {
  vi.unstubAllGlobals();
  escribirConfig(false);
});

afterAll(() => {
  if (antes.config === undefined) delete process.env.GEEPER_CONFIG;
  else process.env.GEEPER_CONFIG = antes.config;
  if (antes.url !== undefined) process.env.GEEPER_URL = antes.url;
  fs.rmSync(dir, { recursive: true, force: true });
});

interface Llamada {
  url: string;
  method: string;
  headers: Headers;
  cuerpo: string;
  bytes: number;
}

/** Simula fetch: cada llamada pasa por `responder`, que devuelve la Response. Lee el cuerpo entero. */
function simularFetch(responder: (ll: Llamada, i: number) => Response | Promise<Response>) {
  const llamadas: Llamada[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    let cuerpo = "";
    let bytes = 0;
    const b = init?.body;
    if (b instanceof ReadableStream) {
      const lector = (b as ReadableStream<Uint8Array>).getReader();
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        bytes += value.byteLength;
      }
    } else if (b != null) {
      cuerpo = String(b);
      bytes = Buffer.byteLength(cuerpo);
    }
    const ll: Llamada = { url, method: init?.method ?? "GET", headers: new Headers(init?.headers), cuerpo, bytes };
    llamadas.push(ll);
    return responder(ll, llamadas.length - 1);
  });
  vi.stubGlobal("fetch", fn);
  return llamadas;
}

const json = (datos: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(datos), { status, headers: { "Content-Type": "application/json", ...headers } });

function cuenta(red: "youtube" | "tiktok"): CuentaDescifrada {
  return { id: "c1", red, externoId: "ext", usuario: "u", acceso: "token-de-acceso-falso", refresco: "token-de-refresco-viejo", expira: null, scopes: "" };
}

function archivoDe(bytes: number, perfil: ArchivoVideo["perfil"] = "shorts-9x16"): ArchivoVideo {
  const ruta = path.join(dir, `video-${bytes}.mp4`);
  if (!fs.existsSync(ruta)) {
    fs.writeFileSync(ruta, "");
    fs.truncateSync(ruta, bytes); // archivo disperso: no ocupa disco
  }
  return { ruta, bytes, perfil, duracion: 30 };
}

const meta = (m: Partial<MetaPublicacion> = {}): MetaPublicacion => ({ titulo: "Mi video", descripcion: "Descripción", privacidad: "privado", programada: null, ...m });

// ---------------------------------------------------------------- YouTube

describe("YouTube", () => {
  it("urlConexion lleva scopes, offline, consent + select_account, PKCE S256 y el callback", () => {
    const u = new URL(youtube.urlConexion("estado123", "reto456"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const q = u.searchParams;
    expect(q.get("client_id")).toBe("cliente-yt-falso");
    expect(q.get("redirect_uri")).toBe("http://localhost:3300/api/cuentas/callback/youtube");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")?.split(" ").sort()).toEqual([
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
    ]);
    expect(q.get("access_type")).toBe("offline");
    expect(q.get("prompt")).toBe("consent select_account");
    expect(q.get("include_granted_scopes")).toBe("true");
    expect(q.get("state")).toBe("estado123");
    expect(q.get("code_challenge")).toBe("reto456");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(youtube.formatoChallenge).toBe("S256");
  });

  it("canjear arma la petición de token y devuelve un CuentaNueva por canal", async () => {
    const ll = simularFetch((l) => {
      if (l.url.startsWith("https://oauth2.googleapis.com/token")) {
        return json({ access_token: "acceso-nuevo-123", expires_in: 3600, refresh_token: "refresco-nuevo-123", scope: "a b" });
      }
      return json({
        items: [
          { id: "UC1", snippet: { title: "Canal Uno", customUrl: "@canaluno", thumbnails: { default: { url: "https://img/1.jpg" } } } },
          { id: "UC2", snippet: { title: "Canal Dos" } },
        ],
      });
    });
    const t0 = Date.now();
    const cuentas = await youtube.canjear("codigo-xyz", "verificador-abc");
    expect(ll[0]!.method).toBe("POST");
    const f = new URLSearchParams(ll[0]!.cuerpo);
    expect(Object.fromEntries(f)).toEqual({
      code: "codigo-xyz",
      client_id: "cliente-yt-falso",
      client_secret: "secreto-yt-falso",
      redirect_uri: "http://localhost:3300/api/cuentas/callback/youtube",
      grant_type: "authorization_code",
      code_verifier: "verificador-abc",
    });
    expect(ll[1]!.url).toBe("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true");
    expect(ll[1]!.headers.get("authorization")).toBe("Bearer acceso-nuevo-123");
    expect(cuentas.map((c) => [c.externoId, c.usuario, c.avatarUrl])).toEqual([
      ["UC1", "@canaluno", "https://img/1.jpg"],
      ["UC2", "Canal Dos", null],
    ]);
    expect(cuentas[0]!.tokens.refresco).toBe("refresco-nuevo-123");
    const exp = cuentas[0]!.tokens.expira!.getTime();
    expect(exp).toBeGreaterThanOrEqual(t0 + 3600_000);
    expect(exp).toBeLessThanOrEqual(Date.now() + 3600_000);
  });

  it("canjear sin refresh_token pide reconectar con consentimiento", async () => {
    simularFetch(() => json({ access_token: "acceso-sin-refresh", expires_in: 3600 }));
    await expect(youtube.canjear("c", "v")).rejects.toThrow(/refresh token/);
  });

  it("refrescar conserva el refresh token anterior si Google no manda otro", async () => {
    const ll = simularFetch(() => json({ access_token: "acceso-refrescado", expires_in: 3599, scope: "s" }));
    const t = await youtube.refrescar(cuenta("youtube"));
    expect(t.acceso).toBe("acceso-refrescado");
    expect(t.refresco).toBeUndefined();
    const f = new URLSearchParams(ll[0]!.cuerpo);
    expect(f.get("grant_type")).toBe("refresh_token");
    expect(f.get("refresh_token")).toBe("token-de-refresco-viejo");
  });

  it("refrescar con invalid_grant lanza ErrorRed auth", async () => {
    simularFetch(() => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400));
    await expect(youtube.refrescar(cuenta("youtube"))).rejects.toMatchObject({ name: "ErrorRed", tipo: "auth" });
  });

  it("sube por tramos: 308 con Range y luego 201 con el id", async () => {
    const archivo = archivoDe(8 * MiB + 1000);
    const ll = simularFetch((l) => {
      if (l.method === "POST") return new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=SES" } });
      if (l.headers.get("content-range")!.startsWith("bytes 0-")) return new Response(null, { status: 308, headers: { Range: `bytes=0-${8 * MiB - 1}` } });
      return json({ id: "VID123" }, 201);
    });
    const s = await youtube.iniciarSubida(cuenta("youtube"), archivo, meta({ titulo: "x".repeat(150) + "<b>", programada: new Date(Date.now() + 86_400_000), privacidad: "publico" }));
    expect(s.subida).toBe("https://www.googleapis.com/upload/youtube/v3/videos?upload_id=SES");
    const ini = ll[0]!;
    expect(ini.url).toBe("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status");
    expect(ini.headers.get("x-upload-content-length")).toBe(String(archivo.bytes));
    expect(ini.headers.get("x-upload-content-type")).toBe("video/mp4");
    expect(ini.headers.get("authorization")).toBe("Bearer token-de-acceso-falso");
    const cuerpo = JSON.parse(ini.cuerpo);
    expect(cuerpo.snippet.title).toHaveLength(100);
    expect(cuerpo.snippet.title).not.toMatch(/[<>]/);
    expect(cuerpo.snippet.categoryId).toBe("22");
    expect(cuerpo.status.privacyStatus).toBe("private"); // programada ⇒ private + publishAt
    expect(cuerpo.status.publishAt).toBeTruthy();
    expect(cuerpo.status.selfDeclaredMadeForKids).toBe(false);

    const hasta1 = Math.min(archivo.bytes, youtube.tramo(s, archivo));
    const r1 = await youtube.subirTramo(cuenta("youtube"), s, archivo, 0, hasta1);
    expect(ll[1]!.headers.get("content-range")).toBe(`bytes 0-${8 * MiB - 1}/${archivo.bytes}`);
    expect(ll[1]!.bytes).toBe(8 * MiB);
    expect(r1).toEqual({ bytes: 8 * MiB });
    const r2 = await youtube.subirTramo(cuenta("youtube"), s, archivo, r1.bytes, archivo.bytes);
    expect(ll[2]!.headers.get("content-range")).toBe(`bytes ${8 * MiB}-${archivo.bytes - 1}/${archivo.bytes}`);
    expect(ll[2]!.bytes).toBe(1000);
    expect(r2).toEqual({ bytes: archivo.bytes, idExterno: "VID123", url: "https://www.youtube.com/shorts/VID123" });
  });

  it("bytesRecibidos: 308 sin Range = 0, 308 con Range, 200 terminado, 404 vencida", async () => {
    const archivo = archivoDe(3 * MiB, "youtube-16x9");
    const s: Sesion = { subida: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=S", perfil: "youtube-16x9" };
    const respuestas = [
      new Response(null, { status: 308 }),
      new Response(null, { status: 308, headers: { Range: "bytes=0-262143" } }),
      json({ id: "V9" }, 200),
      new Response("Not Found", { status: 404 }),
    ];
    const ll = simularFetch((_l, i) => respuestas[i]!);
    expect(await youtube.bytesRecibidos(cuenta("youtube"), s, archivo)).toEqual({ bytes: 0 });
    expect(ll[0]!.method).toBe("PUT");
    expect(ll[0]!.headers.get("content-range")).toBe(`bytes */${archivo.bytes}`);
    expect(ll[0]!.headers.get("content-length")).toBe("0");
    expect(await youtube.bytesRecibidos(cuenta("youtube"), s, archivo)).toEqual({ bytes: 262144 });
    expect(await youtube.bytesRecibidos(cuenta("youtube"), s, archivo)).toEqual({ bytes: archivo.bytes, idExterno: "V9", url: "https://www.youtube.com/watch?v=V9" });
    expect(await youtube.bytesRecibidos(cuenta("youtube"), s, archivo)).toBeNull();
  });

  it("403 quotaExceeded → cuota hasta la medianoche del Pacífico; sin tokens en el mensaje", async () => {
    simularFetch(() => json({ error: { code: 403, message: "quota access_token=abcdefghijkl", errors: [{ reason: "quotaExceeded" }] } }, 403));
    const e = await youtube.iniciarSubida(cuenta("youtube"), archivoDe(1000), meta()).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorRed);
    const er = e as InstanceType<typeof ErrorRed>;
    expect(er.tipo).toBe("cuota");
    expect(er.hasta!.getTime()).toBe(yt.proximaMedianochePacifico().getTime());
    expect(er.message).not.toContain("token-de-acceso-falso");
  });

  it("uploadLimitExceeded es cuota diaria; rateLimitExceeded espera corta; otro 403 es red", () => {
    const cuerpo = (reason: string) => JSON.stringify({ error: { errors: [{ reason }] } });
    expect(yt.clasificarYoutube(cuerpo("uploadLimitExceeded"))?.tipo).toBe("cuota");
    const r = yt.clasificarYoutube(cuerpo("rateLimitExceeded"))!;
    expect(r.tipo).toBe("cuota");
    expect(r.hasta!.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    expect(yt.clasificarYoutube(cuerpo("forbidden"))).toBeNull();
    expect(yt.clasificarYoutube("no es json")).toBeNull();
  });

  it("proximaMedianochePacifico respeta el horario de verano", () => {
    expect(yt.proximaMedianochePacifico(new Date("2026-11-18T20:00:00Z")).toISOString()).toBe("2026-11-19T08:00:00.000Z");
    // 7 de marzo 23:00 PST → medianoche del 8 todavía en PST.
    expect(yt.proximaMedianochePacifico(new Date("2026-03-08T07:00:00Z")).toISOString()).toBe("2026-03-08T08:00:00.000Z");
    // 8 de marzo 05:00 PDT → medianoche del 9 en PDT.
    expect(yt.proximaMedianochePacifico(new Date("2026-03-08T12:00:00Z")).toISOString()).toBe("2026-03-09T07:00:00.000Z");
  });

  it("consultar con id: listo; rejected → error", async () => {
    const s: Sesion = { subida: "x", perfil: "shorts-9x16", idExterno: "V1" };
    const respuestas = [json({ items: [{ id: "V1", status: { uploadStatus: "uploaded" } }] }), json({ items: [{ id: "V1", status: { uploadStatus: "rejected", rejectionReason: "duplicate" } }] })];
    simularFetch((_l, i) => respuestas[i]!);
    expect(await youtube.consultar(cuenta("youtube"), s)).toEqual({ listo: true, idExterno: "V1", url: "https://www.youtube.com/shorts/V1" });
    expect(await youtube.consultar(cuenta("youtube"), s)).toMatchObject({ listo: false, error: expect.stringContaining("duplicate") });
  });
});

// ---------------------------------------------------------------- TikTok

describe("TikTok", () => {
  it("urlConexion: client_key, scopes, callback, state y PKCE; video.publish sólo con publicación directa", () => {
    const q = new URL(tiktok.urlConexion("st", "abcdef0123")).searchParams;
    expect(tiktok.urlConexion("st", "x").startsWith("https://www.tiktok.com/v2/auth/authorize/?")).toBe(true);
    expect(q.get("client_key")).toBe("clave-tt-falsa");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toBe("user.info.basic,video.upload");
    expect(q.get("redirect_uri")).toBe("http://localhost:3300/api/cuentas/callback/tiktok");
    expect(q.get("state")).toBe("st");
    expect(q.get("code_challenge")).toBe("abcdef0123");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(tiktok.formatoChallenge).toBe("S256-hex");
    expect(tiktok.privacidades).toEqual(["borrador"]);

    escribirConfig(true);
    expect(new URL(tiktok.urlConexion("st", "x")).searchParams.get("scope")).toBe("user.info.basic,video.upload,video.publish");
    expect(tiktok.privacidades).toEqual(["borrador", "privado", "publico"]);

    fs.rmSync(path.join(dir, "redes.json"));
    expect(tiktok.privacidades).toEqual(["borrador"]); // sin credenciales no lanza
  });

  it("canjear manda code_verifier y redirect_uri y devuelve una cuenta", async () => {
    const ll = simularFetch((l) => {
      if (l.url.endsWith("/v2/oauth/token/")) {
        return json({ open_id: "OPEN1", access_token: "act.acceso", refresh_token: "rft.refresco", expires_in: 86400, scope: "user.info.basic,video.upload" });
      }
      return json({ data: { user: { open_id: "OPEN1", display_name: "Persona", avatar_url: "https://av" } }, error: { code: "ok" } });
    });
    const cuentas = await tiktok.canjear("cod", "ver");
    expect(ll[0]!.url).toBe("https://open.tiktokapis.com/v2/oauth/token/");
    expect(Object.fromEntries(new URLSearchParams(ll[0]!.cuerpo))).toEqual({
      client_key: "clave-tt-falsa",
      client_secret: "secreto-tt-falso",
      code: "cod",
      grant_type: "authorization_code",
      redirect_uri: "http://localhost:3300/api/cuentas/callback/tiktok",
      code_verifier: "ver",
    });
    expect(ll[1]!.url).toBe("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url");
    expect(ll[1]!.headers.get("authorization")).toBe("Bearer act.acceso");
    expect(cuentas).toHaveLength(1);
    expect(cuentas[0]).toMatchObject({ externoId: "OPEN1", usuario: "Persona", avatarUrl: "https://av", tokens: { acceso: "act.acceso", refresco: "rft.refresco", scopes: "user.info.basic video.upload" } });
  });

  it("refrescar devuelve el refresh token nuevo; invalid_grant → auth", async () => {
    const respuestas = [json({ access_token: "act.2", refresh_token: "rft.2", expires_in: 86400, open_id: "O" }), json({ error: "invalid_grant", error_description: "x" }, 400)];
    const ll = simularFetch((_l, i) => respuestas[i]!);
    const t = await tiktok.refrescar(cuenta("tiktok"));
    expect(t).toMatchObject({ acceso: "act.2", refresco: "rft.2" });
    expect(new URLSearchParams(ll[0]!.cuerpo).get("grant_type")).toBe("refresh_token");
    await expect(tiktok.refrescar(cuenta("tiktok"))).rejects.toMatchObject({ tipo: "auth" });
  });

  describe("fragmentos: cubren el archivo entero, en orden y sin solapes", () => {
    const casos: [string, number, number][] = [
      ["4 MB (un solo fragmento)", 4_000_000, 1],
      ["20 MB", 20 * MiB, 2],
      ["8 MiB × 3 + 123", 8 * MiB * 3 + 123, 3],
    ];
    for (const [nombre, tam, esperado] of casos) {
      it(nombre, async () => {
        const archivo = archivoDe(tam);
        let init: { chunk_size: number; total_chunk_count: number; video_size: number } | null = null;
        const ll = simularFetch((l) => {
          if (l.url.endsWith("/inbox/video/init/")) {
            init = JSON.parse(l.cuerpo).source_info;
            return json({ data: { publish_id: "v_inbox_1", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=1" }, error: { code: "ok" } });
          }
          const [, a, b, t] = l.headers.get("content-range")!.match(/^bytes (\d+)-(\d+)\/(\d+)$/)!;
          expect(Number(t)).toBe(tam);
          expect(l.bytes).toBe(Number(b) - Number(a) + 1);
          expect(l.headers.get("content-length")).toBe(String(l.bytes));
          return new Response(null, { status: Number(b) + 1 === tam ? 201 : 206 });
        });
        const c = cuenta("tiktok");
        const s = await tiktok.iniciarSubida(c, archivo, meta({ privacidad: "borrador" }));
        expect(init).toEqual({ source: "FILE_UPLOAD", video_size: tam, chunk_size: s.chunk, total_chunk_count: esperado });
        expect(s).toMatchObject({ publishId: "v_inbox_1", total: esperado, borrador: true });

        // Mismo bucle que el ejecutor (publicar.ts).
        let bytes = 0;
        const rangos: [number, number][] = [];
        while (bytes < tam) {
          const hasta = Math.min(tam, bytes + tiktok.tramo(s, archivo));
          const r = await tiktok.subirTramo(c, s, archivo, bytes, hasta);
          const [, a, b] = ll.at(-1)!.headers.get("content-range")!.match(/^bytes (\d+)-(\d+)/)!;
          rangos.push([Number(a), Number(b) + 1]);
          expect(r.bytes).toBeGreaterThan(bytes);
          bytes = r.bytes;
        }
        expect(rangos).toHaveLength(esperado);
        expect(rangos[0]![0]).toBe(0);
        expect(rangos.at(-1)![1]).toBe(tam);
        for (let i = 1; i < rangos.length; i++) expect(rangos[i]![0]).toBe(rangos[i - 1]![1]);
        for (const [a, b] of rangos.slice(0, -1)) expect(b - a).toBe(s.chunk);
        const ultimo = rangos.at(-1)!;
        expect(ultimo[1] - ultimo[0]).toBeLessThanOrEqual(128 * 1_000_000);
        if (tam >= 5 * MiB) {
          expect(s.chunk).toBeGreaterThanOrEqual(5 * MiB);
          expect(s.chunk).toBeLessThanOrEqual(64 * MiB);
        }
      });
    }

    it("la fórmula: count = floor(tam / chunk) y fragmentos grandes no pasan de 1000", () => {
      expect(tt.fragmentos(20 * MiB)).toEqual({ chunk: 8 * MiB, total: 2 });
      expect(tt.fragmentos(6 * MiB)).toEqual({ chunk: 6 * MiB, total: 1 });
      const g = tt.fragmentos(10_000 * MiB);
      expect(g.total).toBeLessThanOrEqual(1000);
      expect(g.chunk).toBeLessThanOrEqual(64 * MiB);
    });
  });

  it("publicación directa consulta creator_info y mapea la privacidad", async () => {
    escribirConfig(true);
    const ll = simularFetch((l) => {
      if (l.url.endsWith("/creator_info/query/")) return json({ data: { privacy_level_options: ["SELF_ONLY"], max_video_post_duration_sec: 600 }, error: { code: "ok" } });
      return json({ data: { publish_id: "v_pub_1", upload_url: "https://open-upload.tiktokapis.com/u" }, error: { code: "ok" } });
    });
    const s = await tiktok.iniciarSubida(cuenta("tiktok"), archivoDe(1000), meta({ privacidad: "privado" }));
    expect(ll[1]!.url).toBe("https://open.tiktokapis.com/v2/post/publish/video/init/");
    const cuerpo = JSON.parse(ll[1]!.cuerpo);
    expect(cuerpo.post_info).toMatchObject({ privacy_level: "SELF_ONLY", title: "Mi video\n\nDescripción" });
    expect(s.borrador).toBe(false);
    // Público no está entre las opciones de una app sin auditar.
    await expect(tiktok.iniciarSubida(cuenta("tiktok"), archivoDe(1000), meta({ privacidad: "publico" }))).rejects.toThrow(/no permite/);
  });

  it("clasificación de errores: auth, cuota por minuto y cuota diaria (también con HTTP 200)", async () => {
    const cuerpo = (code: string) => JSON.stringify({ error: { code, message: "m" } });
    expect(tt.clasificarTiktok(cuerpo("access_token_invalid"))?.tipo).toBe("auth");
    const rl = tt.clasificarTiktok(cuerpo("rate_limit_exceeded"))!;
    expect(rl.tipo).toBe("cuota");
    expect(rl.hasta!.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
    const dia = tt.clasificarTiktok(cuerpo("spam_risk_too_many_posts"))!;
    expect(dia.tipo).toBe("cuota");
    expect(dia.hasta!.getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);
    expect(tt.clasificarTiktok(cuerpo("spam_risk_too_many_pending_share"))?.tipo).toBe("cuota");
    expect(tt.clasificarTiktok(cuerpo("invalid_param"))).toBeNull();
    expect(tt.clasificarTiktok(cuerpo("ok"))).toBeNull();

    escribirConfig(true);
    simularFetch(() => json({ data: {}, error: { code: "spam_risk_too_many_posts", message: "cap" } }, 200));
    await expect(tiktok.iniciarSubida(cuenta("tiktok"), archivoDe(1000), meta({ privacidad: "privado" }))).rejects.toMatchObject({ tipo: "cuota" });
  });

  it("consultar: inbox → borrador; PUBLISH_COMPLETE conserva el id int64 exacto; FAILED → error", async () => {
    const s: Sesion = { publishId: "v_pub_9", uploadUrl: "u", chunk: 1000, total: 1, borrador: false, iniciada: new Date().toISOString() };
    const respuestas = [
      json({ data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok" } }),
      new Response('{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7234567890123456789]},"error":{"code":"ok"}}', { status: 200 }),
      json({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [] }, error: { code: "ok" } }),
      json({ data: { status: "FAILED", fail_reason: "duration_check_failed" }, error: { code: "ok" } }),
      json({ data: { status: "PROCESSING_UPLOAD" }, error: { code: "ok" } }),
    ];
    const ll = simularFetch((_l, i) => respuestas[i]!);
    expect(await tiktok.consultar(cuenta("tiktok"), s)).toMatchObject({ listo: true, borrador: true, idExterno: "v_pub_9" });
    expect(JSON.parse(ll[0]!.cuerpo)).toEqual({ publish_id: "v_pub_9" });
    expect(await tiktok.consultar(cuenta("tiktok"), s)).toEqual({ listo: true, idExterno: "7234567890123456789" });
    expect(await tiktok.consultar(cuenta("tiktok"), s)).toEqual({ listo: true, idExterno: "v_pub_9" });
    expect(await tiktok.consultar(cuenta("tiktok"), s)).toEqual({ listo: false, error: "duration_check_failed" });
    expect(await tiktok.consultar(cuenta("tiktok"), s)).toEqual({ listo: false, detalle: "PROCESSING_UPLOAD" });
  });

  it("bytesRecibidos: retoma en múltiplo de chunk; FAILED, vencida o desalineada → null", async () => {
    const archivo = archivoDe(8 * MiB * 3 + 123);
    const base: Sesion = { publishId: "p", uploadUrl: "u", chunk: 8 * MiB, total: 3, borrador: true, iniciada: new Date().toISOString() };
    const vieja: Sesion = { ...base, iniciada: new Date(Date.now() - 2 * 3600_000).toISOString() };
    const estado = (status: string, uploaded_bytes?: number) => json({ data: { status, uploaded_bytes }, error: { code: "ok" } });
    const respuestas = [
      estado("PROCESSING_UPLOAD", 16 * MiB),
      estado("PROCESSING_UPLOAD", 16 * MiB),
      estado("PROCESSING_UPLOAD", 5 * MiB),
      estado("FAILED"),
      estado("SEND_TO_USER_INBOX"),
    ];
    simularFetch((_l, i) => respuestas[i]!);
    const c = cuenta("tiktok");
    expect(await tiktok.bytesRecibidos(c, base, archivo)).toEqual({ bytes: 16 * MiB });
    expect(await tiktok.bytesRecibidos(c, vieja, archivo)).toBeNull();
    expect(await tiktok.bytesRecibidos(c, base, archivo)).toBeNull();
    expect(await tiktok.bytesRecibidos(c, base, archivo)).toBeNull();
    expect(await tiktok.bytesRecibidos(c, base, archivo)).toEqual({ bytes: archivo.bytes });
  });
});
