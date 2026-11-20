/**
 * Contrato que implementa cada red (YouTube, TikTok, Instagram, páginas de Facebook).
 * Ver docs/PUBLICAR.md §9. Los adaptadores sólo hablan HTTP con la red: no tocan la base ni la cola.
 */

export type IdRed = "youtube" | "tiktok" | "instagram" | "facebook";
export const REDES_IDS: IdRed[] = ["youtube", "tiktok", "instagram", "facebook"];

export type Perfil = "shorts-9x16" | "youtube-16x9" | "cuadrado-1x1";
export type Privacidad = "publico" | "no_listado" | "privado" | "borrador";

export interface Tokens {
  acceso: string;
  refresco?: string | null;
  /** Vencimiento del access token; null = no vence (p. ej. token de página de Facebook). */
  expira?: Date | null;
  /** Scopes concedidos, separados por espacio. */
  scopes?: string;
}

/** Lo que devuelve `canjear`: una cuenta lista para guardarse (cifrada) en la base. */
export interface CuentaNueva {
  externoId: string;
  usuario: string;
  avatarUrl?: string | null;
  tokens: Tokens;
}

/** Cuenta con los tokens ya descifrados, sólo en memoria. */
export interface CuentaDescifrada {
  id: string;
  red: IdRed;
  externoId: string;
  usuario: string;
  acceso: string;
  refresco: string | null;
  expira: Date | null;
  scopes: string;
}

export interface ArchivoVideo {
  ruta: string;
  bytes: number;
  perfil: Perfil;
  /** Duración en segundos. */
  duracion: number | null;
}

export interface MetaPublicacion {
  titulo: string;
  descripcion: string;
  privacidad: Privacidad;
  programada: Date | null;
}

/**
 * Estado de la sesión de subida: lo que necesite la red para retomar (URL de sesión, publish_id,
 * id del contenedor, tamaño de fragmento fijo...). Se guarda tal cual en el payload del trabajo,
 * así que debe ser JSON plano. Nunca lleva tokens.
 * El ejecutor le agrega `idExterno` y `url` cuando `subirTramo`/`bytesRecibidos` los devuelven, y
 * `publicando` (ISO) justo antes de llamar a `publicar`.
 */
export type Sesion = Record<string, string | number | boolean | null>;

export interface ResultadoTramo {
  /** Total de bytes que la red confirma tener tras este tramo. */
  bytes: number;
  /** Si la red ya dio el video por recibido y devolvió su id (YouTube lo hace al terminar la subida). */
  idExterno?: string;
  url?: string;
}

export interface Consulta {
  listo: boolean;
  /** Si es definitivo y falló (no se reintenta). */
  error?: string;
  idExterno?: string;
  url?: string;
  /** Quedó como borrador en la red (TikTok inbox, Facebook DRAFT). */
  borrador?: boolean;
  /** Texto para la etapa del trabajo mientras procesa. */
  detalle?: string;
}

export interface Red {
  id: IdRed;
  nombre: string;
  /** Perfiles de render que admite. */
  formatos: Perfil[];
  /** Privacidades que admite (la primera es la de por defecto). */
  privacidades: Privacidad[];
  /** Si admite programar la publicación (`MetaPublicacion.programada`). */
  programar: boolean;
  /** Si usa PKCE. Si es false, `codeChallenge` llega vacío y `codeVerifier` se ignora. */
  pkce: boolean;
  /** "S256" (base64url, RFC 7636) o "S256-hex" (TikTok escritorio: SHA-256 en hexadecimal). */
  formatoChallenge?: "S256" | "S256-hex";

  /** URL de la pantalla oficial de la red. Siempre fuerza elegir cuenta (no reusar la sesión anterior). */
  urlConexion(state: string, codeChallenge: string): string;
  /** Canjea el código. Un login puede traer varias cuentas (canales, páginas). */
  canjear(code: string, codeVerifier: string): Promise<CuentaNueva[]>;
  /** Refresca el access token. Lanza `ErrorRed("auth")` si ya no se puede. */
  refrescar(c: CuentaDescifrada): Promise<Tokens>;
  /** Cuánto antes de `expira` hay que refrescar (ms). Por defecto 5 min. */
  margenRefresco?: number;
  /** Revoca el permiso en la red (si la red tiene ese endpoint). */
  revocar?(c: CuentaDescifrada): Promise<void>;

  /** Tamaño de cada tramo de subida en bytes. `Infinity` = el resto del archivo en un solo pedido. */
  tramo(s: Sesion, archivo: ArchivoVideo): number;
  /** Abre la sesión reanudable. */
  iniciarSubida(c: CuentaDescifrada, archivo: ArchivoVideo, meta: MetaPublicacion): Promise<Sesion>;
  /**
   * Al reanudar: cuántos bytes tiene la red. `null` = la sesión ya no sirve (venció o no se puede
   * retomar) y hay que abrir otra. Si la subida ya había terminado, devuelve el total con `idExterno`.
   */
  bytesRecibidos(c: CuentaDescifrada, s: Sesion, archivo: ArchivoVideo): Promise<ResultadoTramo | null>;
  /** Sube los bytes [desde, hasta) del archivo (leerlos con `leerTramo`). */
  subirTramo(c: CuentaDescifrada, s: Sesion, archivo: ArchivoVideo, desde: number, hasta: number): Promise<ResultadoTramo>;
  /** Después de subir todo (Facebook: upload_phase=finish). Debe ser idempotente. */
  cerrarSubida?(c: CuentaDescifrada, s: Sesion, meta: MetaPublicacion): Promise<void>;
  /** Estado del procesamiento en la red. */
  consultar(c: CuentaDescifrada, s: Sesion): Promise<Consulta>;
  /**
   * Publica lo ya procesado (Instagram: media_publish). Antes de publicar debe comprobar que no esté
   * ya publicado (corte entre la llamada y el guardado) para no duplicar.
   */
  publicar?(c: CuentaDescifrada, s: Sesion, meta: MetaPublicacion): Promise<{ idExterno: string; url?: string }>;
  /** Pone una miniatura propia al video ya subido (YouTube: thumbnails.set). Idempotente. */
  miniatura?(c: CuentaDescifrada, idExterno: string, jpeg: Buffer): Promise<void>;
}

/**
 * Error de una red, ya clasificado:
 * - auth: token vencido o revocado (401). El ejecutor refresca una vez y, si sigue, pide reconectar.
 * - cuota: 429 o cuota diaria agotada. El trabajo espera hasta `hasta` sin gastar intentos.
 * - red: cualquier otro error. El mensaje no debe llevar tokens.
 */
export class ErrorRed extends Error {
  constructor(
    public tipo: "auth" | "cuota" | "red",
    mensaje: string,
    public hasta?: Date,
    public status?: number,
  ) {
    super(mensaje);
    this.name = "ErrorRed";
  }
}
