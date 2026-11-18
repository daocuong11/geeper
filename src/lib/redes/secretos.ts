/**
 * Filtro de secretos para logs, errores y respuestas: ningún token sale de Geeper (PUBLICAR.md §6).
 * Tapa por patrón (parámetros y cabeceras conocidas, URLs de sesión de subida) y por valor (cada
 * token descifrado se registra aquí y se reemplaza donde aparezca).
 */

const conocidos = new Set<string>();

/** Registra un valor secreto para taparlo en cualquier texto posterior. */
export function registrarSecreto(valor: string | null | undefined): void {
  if (valor && valor.length >= 8) conocidos.add(valor);
}

const PATRONES: [RegExp, string][] = [
  // Parámetros de query o de formulario y campos JSON.
  [/((?:access_token|refresh_token|client_secret|code_verifier|fb_exchange_token|id_token|token)["']?\s*[:=]\s*["']?)[^"'&\s,}]+/gi, "$1[oculto]"],
  [/([?&]code=)[^&\s"']+/gi, "$1[oculto]"],
  // Cabeceras de autorización.
  [/(Authorization["']?\s*[:=]\s*["']?(?:Bearer|OAuth)\s+)[^\s"',}]+/gi, "$1[oculto]"],
  [/\b(Bearer|OAuth)\s+[A-Za-z0-9._~+/=-]{12,}/g, "$1 [oculto]"],
  // URLs de sesión de subida: quien las tiene puede subir a la cuenta.
  [/https:\/\/www\.googleapis\.com\/upload\/[^\s"']+/g, "[url de subida oculta]"],
  [/https:\/\/open-upload[^\s"']*tiktokapis\.com[^\s"']*/g, "[url de subida oculta]"],
  [/https:\/\/rupload\.facebook\.com\/[^\s"']+/g, "[url de subida oculta]"],
];

export function tapar(texto: string): string {
  let t = texto;
  for (const v of conocidos) if (t.includes(v)) t = t.split(v).join("[oculto]");
  for (const [re, rep] of PATRONES) t = t.replace(re, rep);
  return t;
}
