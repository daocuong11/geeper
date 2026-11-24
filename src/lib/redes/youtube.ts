/**
 * Adaptador de YouTube (Data API v3, `videos.insert` con subida reanudable). PUBLICAR.md §3 y §9.
 * Referencias (revisadas 2026-11):
 * - OAuth para apps web: https://developers.google.com/identity/protocols/oauth2/web-server
 * - Subida reanudable: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
 * - videos.insert / channels.list / videos.list: https://developers.google.com/youtube/v3/docs
 */
import { credenciales, urlCallback } from "./config";
import { TIMEOUT_SUBIDA_MS, errorDe, formulario, leerTramo, pedir, pedirJson } from "./http";
import { registrarSecreto } from "./secretos";
import {
  ErrorRed,
  type ArchivoVideo,
  type Consulta,
  type CuentaDescifrada,
  type CuentaNueva,
  type Privacidad,
  type Red,
  type ResultadoTramo,
  type Sesion,
  type Tokens,
} from "./tipos";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/youtube/v3";
const SUBIDA = "https://www.googleapis.com/upload/youtube/v3/videos";
const MINIATURA = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set";
/** Límite de YouTube para una miniatura. */
export const MAX_MINIATURA_BYTES = 2 * 1024 * 1024;
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

/** 8 MiB: múltiplo de 256 KiB, como exige la subida por fragmentos (todos iguales salvo el último). */
export const TRAMO_YOUTUBE = 8 * 1024 * 1024;
const MAX_TITULO = 100;
const MAX_DESCRIPCION_BYTES = 5000;

interface RespToken {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

interface Canal {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string } | undefined> };
}

interface Video {
  id: string;
  status?: { uploadStatus?: string; failureReason?: string; rejectionReason?: string };
  processingDetails?: { processingStatus?: string; processingFailureReason?: string };
}

/** Próxima medianoche en America/Los_Angeles, cuando se reinicia la cuota diaria de la API. */
export function proximaMedianochePacifico(ahora = new Date()): Date {
  const zona = "America/Los_Angeles";
  const partes = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d);
    const v = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return { y: v("year"), m: v("month"), d: v("day"), h: v("hour"), mi: v("minute"), s: v("second") };
  };
  // Desfase de la zona en un instante: hora de pared leída como UTC menos el instante real.
  const desfase = (d: Date) => {
    const x = partes(d);
    return Date.UTC(x.y, x.m - 1, x.d, x.h, x.mi, x.s) - Math.floor(d.getTime() / 1000) * 1000;
  };
  const hoy = partes(ahora);
  const paredMedianoche = Date.UTC(hoy.y, hoy.m - 1, hoy.d + 1, 0, 0, 0);
  let t = paredMedianoche - desfase(ahora);
  // Si entre ahora y la medianoche cambia el horario de verano, se corrige con el desfase de ese momento.
  t = paredMedianoche - desfase(new Date(t));
  return new Date(t);
}

/** Reconoce la cuota de YouTube (403 con `reason`) y el refresh token vencido o revocado. */
export function clasificarYoutube(cuerpo: string): ErrorRed | null {
  type ErrorCuerpo = { error?: unknown; error_description?: string } | null;
  let j: ErrorCuerpo;
  try {
    j = JSON.parse(cuerpo) as ErrorCuerpo;
  } catch {
    return null;
  }
  if (!j) return null;
  if (j.error === "invalid_grant") {
    return new ErrorRed("auth", "Google ya no acepta el permiso de esta cuenta (revocado o vencido): reconecta la cuenta", undefined, 400);
  }
  const e = j.error as { errors?: { reason?: string }[]; message?: string } | undefined;
  const razones = typeof e === "object" && e ? (e.errors ?? []).map((x) => x.reason ?? "") : [];
  if (razones.some((r) => r === "quotaExceeded" || r === "dailyLimitExceeded" || r === "uploadLimitExceeded")) {
    const hasta = proximaMedianochePacifico();
    return new ErrorRed("cuota", `YouTube: cuota diaria agotada (${razones.join(", ")}); se reinicia a medianoche hora del Pacífico`, hasta, 403);
  }
  if (razones.some((r) => r === "rateLimitExceeded" || r === "userRateLimitExceeded")) {
    // Límite de ritmo de corto plazo, no la cuota diaria: alcanza con esperar unos minutos.
    return new ErrorRed("cuota", `YouTube: demasiadas solicitudes seguidas (${razones.join(", ")})`, new Date(Date.now() + 15 * 60_000), 403);
  }
  return null;
}

const bearer = (c: CuentaDescifrada) => ({ Authorization: `Bearer ${c.acceso}` });

function privacidadYoutube(p: Privacidad): "private" | "unlisted" | "public" {
  if (p === "privado") return "private";
  if (p === "no_listado") return "unlisted";
  if (p === "publico") return "public";
  throw new ErrorRed("red", `YouTube no admite la privacidad «${p}»`);
}

/** YouTube no acepta `<` ni `>` en título ni descripción. */
const limpiar = (t: string) => t.replace(/[<>]/g, "").trim();

function cortarCaracteres(t: string, max: number): string {
  const c = Array.from(t);
  return c.length <= max ? t : c.slice(0, max).join("");
}

function cortarBytes(t: string, max: number): string {
  if (Buffer.byteLength(t, "utf8") <= max) return t;
  let s = "";
  let n = 0;
  for (const ch of t) {
    const b = Buffer.byteLength(ch, "utf8");
    if (n + b > max) break;
    s += ch;
    n += b;
  }
  return s;
}

export function urlVideo(id: string, perfil: ArchivoVideo["perfil"] | string | null | undefined): string {
  return perfil === "shorts-9x16" ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
}

/** Cabecera `Range: bytes=0-N` de un 308 → bytes recibidos (N+1). Sin cabecera = 0. */
export function bytesDeRange(range: string | null): number {
  const m = range?.match(/bytes=\d+-(\d+)/);
  return m ? Number(m[1]) + 1 : 0;
}

function tokensDe(t: RespToken, refresco: string | null | undefined): Tokens {
  return {
    acceso: t.access_token,
    refresco,
    expira: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
    scopes: t.scope,
  };
}

async function videoTerminado(r: Response, archivo: ArchivoVideo): Promise<ResultadoTramo> {
  const v = (await r.json()) as { id?: string };
  if (!v.id) throw new ErrorRed("red", "YouTube terminó la subida sin devolver el id del video", undefined, r.status);
  return { bytes: archivo.bytes, idExterno: v.id, url: urlVideo(v.id, archivo.perfil) };
}

/** URL de la sesión de subida. Se guarda en `subida` (no en `url`) porque el ejecutor escribe en
 * `url` el enlace público del video cuando termina la subida. */
function urlSubida(s: Sesion): string {
  if (typeof s.subida !== "string" || !s.subida) throw new ErrorRed("red", "YouTube: la sesión de subida guardada no tiene URL");
  return s.subida;
}

export const youtube: Red = {
  id: "youtube",
  nombre: "YouTube",
  formatos: ["shorts-9x16", "youtube-16x9", "cuadrado-1x1"],
  privacidades: ["privado", "no_listado", "publico"],
  programar: true,
  pkce: true,
  formatoChallenge: "S256",

  urlConexion(state, codeChallenge) {
    const { clientId } = credenciales("youtube");
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: urlCallback("youtube"),
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      // consent: garantiza refresh_token en cada conexión; select_account: siempre elegir cuenta/canal.
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${AUTH}?${q}`;
  },

  async canjear(code, codeVerifier) {
    const { clientId, clientSecret } = credenciales("youtube");
    const t = await pedirJson<RespToken>(
      TOKEN,
      {
        method: "POST",
        body: formulario({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: urlCallback("youtube"),
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        }),
      },
      "Google: canje del código",
      clasificarYoutube,
    );
    registrarSecreto(t.access_token);
    registrarSecreto(t.refresh_token);
    if (!t.refresh_token) {
      throw new Error(
        "Google no entregó un refresh token, así que Geeper no podría publicar más tarde. Quita el acceso de Geeper en myaccount.google.com/permissions y vuelve a conectar aceptando todos los permisos.",
      );
    }
    const r = await pedirJson<{ items?: Canal[] }>(
      `${API}/channels?part=snippet&mine=true`,
      { headers: { Authorization: `Bearer ${t.access_token}` } },
      "YouTube: canales de la cuenta",
      clasificarYoutube,
    );
    const canales = r.items ?? [];
    if (canales.length === 0) throw new Error("Esa cuenta de Google no tiene un canal de YouTube. Crea el canal o elige otra cuenta al conectar.");
    const tokens = tokensDe(t, t.refresh_token);
    return canales.map<CuentaNueva>((ch) => {
      const th = ch.snippet?.thumbnails;
      return {
        externoId: ch.id,
        usuario: ch.snippet?.customUrl || ch.snippet?.title || ch.id,
        avatarUrl: th?.default?.url ?? th?.medium?.url ?? th?.high?.url ?? null,
        tokens: { ...tokens },
      };
    });
  },

  async refrescar(c) {
    if (!c.refresco) throw new ErrorRed("auth", "La cuenta de YouTube no tiene refresh token: reconecta la cuenta");
    const { clientId, clientSecret } = credenciales("youtube");
    const t = await pedirJson<RespToken>(
      TOKEN,
      { method: "POST", body: formulario({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: c.refresco }) },
      "Google: refresco del token",
      clasificarYoutube,
    );
    registrarSecreto(t.access_token);
    registrarSecreto(t.refresh_token);
    // Google casi nunca rota el refresh token: undefined = conservar el que ya está guardado.
    return tokensDe(t, t.refresh_token ?? undefined);
  },

  async revocar(c) {
    const r = await pedir(REVOKE, { method: "POST", body: formulario({ token: c.refresco ?? c.acceso }) });
    // 400 invalid_token = ya estaba revocado: no es un error para quien desconecta.
    if (!r.ok && r.status !== 400) throw await errorDe(r, "Google: revocar permiso");
  },

  tramo() {
    return TRAMO_YOUTUBE;
  },

  async iniciarSubida(c, archivo, meta) {
    const programada = meta.programada && meta.programada.getTime() > Date.now() ? meta.programada : null;
    const titulo = cortarCaracteres(limpiar(meta.titulo), MAX_TITULO) || "Video";
    const status: Record<string, unknown> = {
      // publishAt sólo vale con privacyStatus private: YouTube lo publica solo a esa hora.
      privacyStatus: programada ? "private" : privacidadYoutube(meta.privacidad),
      selfDeclaredMadeForKids: false,
    };
    if (programada) status.publishAt = programada.toISOString();
    const cuerpo = {
      snippet: { title: titulo, description: cortarBytes(limpiar(meta.descripcion), MAX_DESCRIPCION_BYTES), categoryId: "22" },
      status,
    };
    const r = await pedir(`${SUBIDA}?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: {
        ...bearer(c),
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(archivo.bytes),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw await errorDe(r, "YouTube: abrir subida", clasificarYoutube);
    const url = r.headers.get("location");
    if (!url) throw new ErrorRed("red", "YouTube no devolvió la URL de la sesión de subida", undefined, r.status);
    return { subida: url, perfil: archivo.perfil };
  },

  async subirTramo(c, s, archivo, desde, hasta) {
    const init: RequestInit & { duplex: "half"; timeout: number } = {
      method: "PUT",
      headers: {
        ...bearer(c),
        "Content-Type": "video/mp4",
        "Content-Length": String(hasta - desde),
        "Content-Range": `bytes ${desde}-${hasta - 1}/${archivo.bytes}`,
      },
      body: leerTramo(archivo.ruta, desde, hasta),
      duplex: "half",
      // 308 es «Resume Incomplete», no una redirección.
      redirect: "manual",
      timeout: TIMEOUT_SUBIDA_MS,
    };
    const r = await pedir(urlSubida(s), init);
    if (r.status === 308) {
      await r.body?.cancel();
      return { bytes: bytesDeRange(r.headers.get("range")) };
    }
    if (r.status === 200 || r.status === 201) return videoTerminado(r, archivo);
    throw await errorDe(r, "YouTube: subir tramo", clasificarYoutube);
  },

  async miniatura(c, idExterno, jpeg) {
    if (jpeg.length > MAX_MINIATURA_BYTES) throw new ErrorRed("red", "La portada pesa más de 2 MB, el máximo de YouTube para una miniatura");
    // thumbnails.set con el permiso youtube.upload (ya pedido al conectar). 50 unidades de cuota.
    const r = await pedir(`${MINIATURA}?videoId=${encodeURIComponent(idExterno)}&uploadType=media`, {
      method: "POST",
      headers: { ...bearer(c), "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) },
      body: new Uint8Array(jpeg),
    });
    if (r.ok) {
      await r.body?.cancel();
      return;
    }
    const cuerpo = await r.text().catch(() => "");
    // Sin verificación por teléfono YouTube no acepta miniaturas propias (403 forbidden).
    if (r.status === 403) throw new ErrorRed("red", "YouTube no aceptó la miniatura: el canal tiene que estar verificado por teléfono (youtube.com/verify)", undefined, 403);
    throw await errorDe(new Response(cuerpo, { status: r.status, headers: r.headers }), "YouTube: poner miniatura", clasificarYoutube);
  },

  async bytesRecibidos(c, s, archivo) {
    const r = await pedir(urlSubida(s), {
      method: "PUT",
      headers: { ...bearer(c), "Content-Length": "0", "Content-Range": `bytes */${archivo.bytes}` },
      redirect: "manual",
    });
    if (r.status === 308) {
      await r.body?.cancel();
      return { bytes: bytesDeRange(r.headers.get("range")) };
    }
    if (r.status === 200 || r.status === 201) return videoTerminado(r, archivo);
    if (r.status === 404 || r.status === 410) {
      await r.body?.cancel();
      return null; // la sesión venció: se abre otra (la anterior nunca creó un video)
    }
    throw await errorDe(r, "YouTube: consultar subida", clasificarYoutube);
  },

  async consultar(c, s): Promise<Consulta> {
    const id = typeof s.idExterno === "string" ? s.idExterno : null;
    if (!id) throw new ErrorRed("red", "YouTube: la subida terminó sin id de video en la sesión");
    const url = urlVideo(id, typeof s.perfil === "string" ? s.perfil : null);
    const r = await pedirJson<{ items?: Video[] }>(
      `${API}/videos?part=status,processingDetails&id=${encodeURIComponent(id)}`,
      { headers: bearer(c) },
      "YouTube: estado del video",
      clasificarYoutube,
    );
    const v = r.items?.[0];
    const estado = v?.status?.uploadStatus;
    if (estado === "rejected") return { listo: false, error: `rechazado (${v?.status?.rejectionReason ?? "sin motivo"})`, idExterno: id };
    if (estado === "failed") return { listo: false, error: `falló el procesamiento (${v?.status?.failureReason ?? "sin motivo"})`, idExterno: id };
    if (estado === "deleted") return { listo: false, error: "el video fue borrado", idExterno: id };
    // YouTube ya creó el video al terminar la subida; el procesamiento sigue en segundo plano.
    return { listo: true, idExterno: id, url };
  },
};
