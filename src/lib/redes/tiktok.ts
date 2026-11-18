/**
 * Adaptador de TikTok: Login Kit para escritorio + Content Posting API (FILE_UPLOAD). PUBLICAR.md §3 y §9.
 * Referencias (revisadas 2026-11):
 * - Login Kit escritorio: https://developers.tiktok.com/doc/login-kit-desktop
 * - Tokens: https://developers.tiktok.com/docs/en/oauth-get-a-user-access-token (y refresh / revoke)
 * - Subida por fragmentos: https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
 * - Borrador (inbox): https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
 * - Publicación directa: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 * - creator_info: https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
 * - Estado: https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
 */
import { credenciales, leerConfig, urlCallback } from "./config";
import { TIMEOUT_SUBIDA_MS, errorDe, formulario, leerTramo, pedir } from "./http";
import { registrarSecreto } from "./secretos";
import {
  ErrorRed,
  type Consulta,
  type CuentaDescifrada,
  type Privacidad,
  type Red,
  type ResultadoTramo,
  type Sesion,
  type Tokens,
} from "./tipos";

const AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";

const MiB = 1024 * 1024;
/** Fragmento preferido. La regla oficial: de 5 a 64 MB; el último absorbe el resto (hasta 128 MB). */
export const CHUNK_TIKTOK = 8 * MiB;
/** Por debajo de esto el video se sube entero en un solo fragmento. */
const MIN_CHUNK = 5 * MiB;
const MAX_CHUNK = 64 * MiB;
const MAX_FRAGMENTOS = 1000;
/** El upload_url vale 1 h desde que se emite; se deja margen para no empezar un tramo que no llega. */
const VIDA_UPLOAD_URL_MS = 55 * 60_000;
const MAX_TITULO_UTF16 = 2200;

const DIA_MS = 24 * 60 * 60_000;

interface RespToken {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface Envoltura<T> {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
}

interface InfoCreador {
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

interface EstadoPost {
  status?: string;
  fail_reason?: string;
  publicaly_available_post_id?: unknown[];
  uploaded_bytes?: number;
}

/** Fragmentación según la guía de transferencia de TikTok. */
export function fragmentos(tam: number): { chunk: number; total: number } {
  if (tam <= 0) throw new Error("El archivo está vacío");
  // Menos de 5 MB: la regla exige subirlo entero. Entre 5 MB y 8 MiB también va entero (un solo
  // fragmento de su tamaño, dentro de 5–64 MB), porque floor(tam/8 MiB) daría 0 fragmentos.
  if (tam < MIN_CHUNK || tam < CHUNK_TIKTOK) return { chunk: tam, total: 1 };
  // Se agranda el fragmento sólo si pasaría de 1000 fragmentos (archivos de más de 8 GB).
  const chunk = Math.min(MAX_CHUNK, Math.max(CHUNK_TIKTOK, Math.ceil(tam / MAX_FRAGMENTOS)));
  return { chunk, total: Math.floor(tam / chunk) };
}

/** Fin (exclusivo) del fragmento que empieza en `desde`: el último llega hasta el final del archivo. */
export function finFragmento(chunk: number, total: number, tam: number, desde: number): number {
  if (desde % chunk !== 0) throw new ErrorRed("red", `TikTok: el tramo debe empezar en un múltiplo del fragmento (${desde} no lo es)`);
  const i = desde / chunk;
  if (i >= total) throw new ErrorRed("red", `TikTok: fragmento ${i + 1} fuera de rango (son ${total})`);
  return i === total - 1 ? tam : desde + chunk;
}

/** Clasifica `error.code` de la Content Posting API y los errores OAuth del endpoint de tokens. */
export function clasificarTiktok(cuerpo: string): ErrorRed | null {
  type ErrorCuerpo = { error?: unknown; error_description?: string } | null;
  let j: ErrorCuerpo;
  try {
    j = JSON.parse(cuerpo) as ErrorCuerpo;
  } catch {
    return null;
  }
  if (!j) return null;
  const code = typeof j.error === "string" ? j.error : typeof j.error === "object" && j.error ? (j.error as { code?: string }).code : undefined;
  const msg = typeof j.error === "object" && j.error ? ((j.error as { message?: string }).message ?? "") : (j.error_description ?? "");
  if (!code || code === "ok") return null;
  const texto = `TikTok: ${code}${msg ? ` (${msg.slice(0, 200)})` : ""}`;
  if (code === "access_token_invalid" || code === "scope_not_authorized" || code === "invalid_grant") return new ErrorRed("auth", texto, undefined, 401);
  // Límite por minuto (6 inicios/min, 30 consultas/min por token).
  if (code === "rate_limit_exceeded") return new ErrorRed("cuota", texto, new Date(Date.now() + 60_000), 429);
  // Topes diarios: de publicaciones, de borradores pendientes (5 cada 24 h) o de usuarios activos de la app.
  if (code === "spam_risk_too_many_posts" || code === "spam_risk_too_many_pending_share" || code === "reached_active_user_cap") {
    return new ErrorRed("cuota", texto, new Date(Date.now() + DIA_MS), 403);
  }
  return null;
}

/**
 * Llama a la API y devuelve `data`. TikTok a veces responde HTTP 200 con `error.code` distinto de
 * "ok" (p. ej. creator_info), así que se revisa el cuerpo aunque el status sea OK.
 */
async function api<T>(ruta: string, c: CuentaDescifrada, cuerpo: unknown, contexto: string): Promise<{ data: T; texto: string }> {
  const r = await pedir(`${API}${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.acceso}`, "Content-Type": "application/json; charset=UTF-8" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text().catch(() => "");
  let j: Envoltura<T> | null = null;
  try {
    j = JSON.parse(texto) as Envoltura<T>;
  } catch {
    j = null;
  }
  const code = j?.error?.code;
  if (r.ok && j && (!code || code === "ok") && j.data !== undefined) return { data: j.data, texto };
  throw await errorDe(new Response(texto, { status: r.status === 200 && code ? 400 : r.status, headers: r.headers }), contexto, clasificarTiktok);
}

async function token(datos: Record<string, string | undefined>, contexto: string): Promise<RespToken> {
  const r = await pedir(`${API}/oauth/token/`, { method: "POST", body: formulario(datos) });
  const texto = await r.text().catch(() => "");
  let j: RespToken | null = null;
  try {
    j = JSON.parse(texto) as RespToken;
  } catch {
    j = null;
  }
  if (!r.ok || !j?.access_token) {
    throw await errorDe(new Response(texto, { status: r.ok ? 400 : r.status, headers: r.headers }), contexto, clasificarTiktok);
  }
  registrarSecreto(j.access_token);
  registrarSecreto(j.refresh_token);
  return j;
}

function tokensDe(t: RespToken): Tokens {
  return {
    acceso: t.access_token!,
    refresco: t.refresh_token ?? undefined,
    expira: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
    // TikTok separa los scopes con coma; en Geeper van separados por espacio.
    scopes: t.scope?.split(/[,\s]+/).filter(Boolean).join(" "),
  };
}

function publicacionDirecta(): boolean {
  try {
    return !!leerConfig().tiktok?.publicacionDirecta;
  } catch {
    return false;
  }
}

function nivelPrivacidad(p: Privacidad): "PUBLIC_TO_EVERYONE" | "SELF_ONLY" {
  if (p === "publico") return "PUBLIC_TO_EVERYONE";
  if (p === "privado") return "SELF_ONLY";
  throw new ErrorRed("red", `TikTok no admite la privacidad «${p}» en publicación directa`);
}

/** Corta a `max` unidades UTF-16 sin partir un par sustituto (emoji). */
function cortarUtf16(t: string, max: number): string {
  if (t.length <= max) return t;
  let s = t.slice(0, max);
  const ult = s.charCodeAt(s.length - 1);
  if (ult >= 0xd800 && ult <= 0xdbff) s = s.slice(0, -1);
  return s;
}

/** El id del post es int64: se lee del texto crudo para no perder precisión al pasar por Number. */
function idPublico(texto: string): string | null {
  const m = texto.match(/"publicaly_available_post_id"\s*:\s*\[\s*"?(\d+)"?/);
  return m?.[1] ?? null;
}

function num(s: Sesion, k: string): number {
  const v = s[k];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ErrorRed("red", `TikTok: la sesión de subida guardada no tiene «${k}»`);
  return v;
}

async function estado(c: CuentaDescifrada, s: Sesion): Promise<{ data: EstadoPost; texto: string }> {
  return api<EstadoPost>("/post/publish/status/fetch/", c, { publish_id: String(s.publishId) }, "TikTok: estado de la publicación");
}

export const tiktok: Red = {
  id: "tiktok",
  nombre: "TikTok",
  formatos: ["shorts-9x16"],
  /** Sin auditoría de la app sólo hay borrador; con publicación directa, también privado y público. */
  get privacidades(): Privacidad[] {
    return publicacionDirecta() ? ["borrador", "privado", "publico"] : ["borrador"];
  },
  programar: false,
  pkce: true,
  // Login Kit para escritorio: "You must use hex encoding of SHA256 to generate the code challenge".
  formatoChallenge: "S256-hex",

  urlConexion(state, codeChallenge) {
    const { clientKey, publicacionDirecta: directa } = credenciales("tiktok");
    const q = new URLSearchParams({
      client_key: clientKey,
      response_type: "code",
      scope: directa ? "user.info.basic,video.upload,video.publish" : "user.info.basic,video.upload",
      redirect_uri: urlCallback("tiktok"),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    // VERIFICAR: Login Kit no documenta ningún parámetro para forzar elegir cuenta (como prompt=select_account
    // de Google). Para conectar otra cuenta hay que cerrar la sesión de TikTok en el navegador o usar una
    // ventana privada (PUBLICAR.md §3).
    return `${AUTH}?${q}`;
  },

  async canjear(code, codeVerifier) {
    const { clientKey, clientSecret } = credenciales("tiktok");
    const t = await token(
      {
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: urlCallback("tiktok"),
        code_verifier: codeVerifier,
      },
      "TikTok: canje del código",
    );
    const r = await pedir(`${API}/user/info/?fields=open_id,display_name,avatar_url`, { headers: { Authorization: `Bearer ${t.access_token}` } });
    const texto = await r.text().catch(() => "");
    type Usuario = Envoltura<{ user?: { open_id?: string; display_name?: string; avatar_url?: string } }>;
    let j: Usuario | null = null;
    try {
      j = JSON.parse(texto) as Usuario;
    } catch {
      j = null;
    }
    if (!r.ok || (j?.error?.code && j.error.code !== "ok")) {
      throw await errorDe(new Response(texto, { status: r.ok ? 400 : r.status, headers: r.headers }), "TikTok: datos de la cuenta", clasificarTiktok);
    }
    const u = j?.data?.user;
    const externoId = u?.open_id ?? t.open_id;
    if (!externoId) throw new ErrorRed("red", "TikTok no devolvió el open_id de la cuenta");
    return [{ externoId, usuario: u?.display_name || externoId, avatarUrl: u?.avatar_url ?? null, tokens: tokensDe(t) }];
  },

  async refrescar(c) {
    if (!c.refresco) throw new ErrorRed("auth", "La cuenta de TikTok no tiene refresh token: reconecta la cuenta");
    const { clientKey, clientSecret } = credenciales("tiktok");
    // TikTok rota el refresh token en cada refresco: hay que guardar el nuevo (el anterior deja de servir).
    // VERIFICAR: la doc de refresco no lista el código de error de un refresh token vencido o reemplazado;
    // se asume `invalid_grant` (estándar OAuth). Otro código queda como error "red".
    const t = await token({ client_key: clientKey, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: c.refresco }, "TikTok: refresco del token");
    return tokensDe(t);
  },

  async revocar(c) {
    const { clientKey, clientSecret } = credenciales("tiktok");
    const r = await pedir(`${API}/oauth/revoke/`, { method: "POST", body: formulario({ client_key: clientKey, client_secret: clientSecret, token: c.acceso }) });
    if (!r.ok) throw await errorDe(r, "TikTok: revocar permiso", clasificarTiktok);
  },

  /**
   * Siempre el tamaño del fragmento fijado al iniciar. El ejecutor pide [desde, desde+chunk) y, en el
   * último fragmento, `subirTramo` extiende `hasta` al final del archivo: TikTok exige que el último
   * absorba el resto (count = floor(tam/chunk)), así que es el único caso en que se envían más bytes
   * que los pedidos. Como cada tramo anterior es exactamente un fragmento, `desde` siempre cae en un
   * múltiplo de `chunk`.
   */
  tramo(s) {
    return num(s, "chunk");
  },

  async iniciarSubida(c, archivo, meta) {
    const { chunk, total } = fragmentos(archivo.bytes);
    const source_info = { source: "FILE_UPLOAD", video_size: archivo.bytes, chunk_size: chunk, total_chunk_count: total };
    const borrador = meta.privacidad === "borrador";
    let data: { publish_id?: string; upload_url?: string };
    if (borrador) {
      ({ data } = await api<typeof data>("/post/publish/inbox/video/init/", c, { source_info }, "TikTok: abrir subida (borrador)"));
    } else {
      if (!publicacionDirecta()) throw new ErrorRed("red", "TikTok: la publicación directa no está habilitada (publicacionDirecta en redes.json); usa borrador");
      const nivel = nivelPrivacidad(meta.privacidad);
      // La doc pide consultar creator_info antes: privacy_level debe estar en privacy_level_options.
      const { data: info } = await api<InfoCreador>("/post/publish/creator_info/query/", c, undefined, "TikTok: datos del creador");
      const opciones = info.privacy_level_options ?? [];
      if (!opciones.includes(nivel)) {
        throw new ErrorRed("red", `TikTok no permite «${meta.privacidad}» en esta cuenta (opciones: ${opciones.join(", ") || "ninguna"}). Sin auditoría de la app sólo se admite privado.`);
      }
      if (info.max_video_post_duration_sec && archivo.duracion && archivo.duracion > info.max_video_post_duration_sec) {
        throw new ErrorRed("red", `TikTok: el video dura ${Math.round(archivo.duracion)} s y esta cuenta admite hasta ${info.max_video_post_duration_sec} s`);
      }
      const texto = [meta.titulo.trim(), meta.descripcion.trim()].filter(Boolean).join("\n\n");
      const post_info = {
        title: cortarUtf16(texto, MAX_TITULO_UTF16),
        privacy_level: nivel,
        disable_comment: !!info.comment_disabled,
        disable_duet: !!info.duet_disabled,
        disable_stitch: !!info.stitch_disabled,
      };
      ({ data } = await api<typeof data>("/post/publish/video/init/", c, { post_info, source_info }, "TikTok: abrir subida"));
    }
    if (!data.publish_id || !data.upload_url) throw new ErrorRed("red", "TikTok no devolvió publish_id o upload_url al abrir la subida");
    return { publishId: data.publish_id, uploadUrl: data.upload_url, chunk, total, tamano: archivo.bytes, borrador, iniciada: new Date().toISOString() };
  },

  async subirTramo(_c, s, archivo, desde, _hasta): Promise<ResultadoTramo> {
    void _c;
    void _hasta;
    const chunk = num(s, "chunk");
    const total = num(s, "total");
    const fin = finFragmento(chunk, total, archivo.bytes, desde);
    // El upload_url es prefirmado: la doc no pide Authorization en el PUT.
    const init: RequestInit & { duplex: "half"; timeout: number } = {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(fin - desde),
        "Content-Range": `bytes ${desde}-${fin - 1}/${archivo.bytes}`,
      },
      body: leerTramo(archivo.ruta, desde, fin),
      duplex: "half",
      timeout: TIMEOUT_SUBIDA_MS,
    };
    const r = await pedir(String(s.uploadUrl), init);
    if (r.status === 206 || r.status === 201) {
      await r.body?.cancel();
      return { bytes: r.status === 201 ? archivo.bytes : fin };
    }
    // 403 = el upload_url venció (1 h): el próximo intento abre otra sesión vía bytesRecibidos → null.
    throw await errorDe(r, "TikTok: subir fragmento", clasificarTiktok);
  },

  async bytesRecibidos(c, s, archivo) {
    // VERIFICAR: la doc no describe cómo reanudar una subida FILE_UPLOAD. Se asume que basta seguir
    // enviando los fragmentos que faltan al mismo upload_url desde `uploaded_bytes`. Si TikTok no lo
    // acepta, devolver null siempre (sesión nueva) también es seguro: la anterior nunca se publicó.
    const iniciada = Date.parse(String(s.iniciada));
    const vencida = !Number.isFinite(iniciada) || Date.now() - iniciada > VIDA_UPLOAD_URL_MS;
    let e: EstadoPost;
    try {
      ({ data: e } = await estado(c, s));
    } catch (err) {
      if (err instanceof ErrorRed && err.tipo !== "red") throw err; // auth o cuota: que decida el ejecutor
      return null;
    }
    const st = e.status;
    if (st === "FAILED") return null;
    if (st === "SEND_TO_USER_INBOX" || st === "PUBLISH_COMPLETE" || st === "PROCESSING_DOWNLOAD") return { bytes: archivo.bytes };
    if (st !== "PROCESSING_UPLOAD") return null;
    const chunk = num(s, "chunk");
    const subidos = typeof e.uploaded_bytes === "number" ? e.uploaded_bytes : -1;
    if (subidos >= archivo.bytes) return { bytes: archivo.bytes };
    if (vencida) return null;
    // VERIFICAR: la doc dice que uploaded_bytes es «1-indexed»; se interpreta como cantidad de bytes.
    if (subidos >= 0 && subidos % chunk === 0 && subidos < archivo.bytes) return { bytes: subidos };
    return null;
  },

  async consultar(c, s): Promise<Consulta> {
    const publishId = String(s.publishId);
    const { data: e, texto } = await estado(c, s);
    switch (e.status) {
      case "SEND_TO_USER_INBOX":
        return { listo: true, borrador: true, idExterno: publishId, detalle: "En la bandeja de TikTok: publícalo desde la app" };
      case "PUBLISH_COMPLETE": {
        // El id público sólo llega si el post es público y pasó moderación; si no, queda el publish_id.
        // VERIFICAR: no hay URL canónica sin el @usuario (requiere el scope user.info.profile); no se arma url.
        return { listo: true, idExterno: idPublico(texto) ?? publishId };
      }
      case "FAILED":
        return { listo: false, error: e.fail_reason || "falló sin motivo informado" };
      default:
        return { listo: false, detalle: e.status ?? "sin estado" };
    }
  },
};
