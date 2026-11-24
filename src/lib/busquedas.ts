/**
 * «Lo que busca la gente»: sugerencias del autocompletado de YouTube para un tema. Gratis y sin clave,
 * pero no es una API oficial (es la que usa la caja de búsqueda): si Google la cambia o la bloquea,
 * Geeper sigue igual y sólo no muestra sugerencias. Sale a Google sólo el texto del tema.
 *
 * Idea de every-app/open-seo (skill `keyword-research`, MIT): elegir el tema por lo que la gente busca
 * y por encaje con el canal, no por volumen; su fuente de datos (DataForSEO) es de pago.
 */

const URL_SUGERENCIAS = "https://suggestqueries.google.com/complete/search";
const CACHE_MS = 60 * 60 * 1000;
const MAX = 8;
/** País de las búsquedas (código ISO de 2 letras). */
export const PAIS = (process.env.GEEPER_PAIS_BUSQUEDAS ?? "MX").toUpperCase();

const cache = new Map<string, { hasta: number; sugerencias: string[] }>();

/** Lee la respuesta `client=firefox`: `[consulta, [sugerencias…], …]` (función pura). */
export function leerSugerencias(datos: unknown, consulta: string): string[] {
  if (!Array.isArray(datos) || !Array.isArray(datos[1])) return [];
  const propia = consulta.trim().toLocaleLowerCase("es");
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const s of datos[1] as unknown[]) {
    if (typeof s !== "string") continue;
    const t = s.replace(/\s+/g, " ").trim();
    const k = t.toLocaleLowerCase("es");
    if (!t || k === propia || vistas.has(k) || t.length > 100) continue;
    vistas.add(k);
    out.push(t);
    if (out.length >= MAX) break;
  }
  return out;
}

export async function sugerenciasYoutube(consulta: string, pedir: typeof fetch = fetch): Promise<string[]> {
  const q = consulta.replace(/\s+/g, " ").trim().slice(0, 100);
  if (q.length < 3) return [];
  const clave = `${PAIS}|${q.toLocaleLowerCase("es")}`;
  const guardada = cache.get(clave);
  if (guardada && guardada.hasta > Date.now()) return guardada.sugerencias;
  const url = `${URL_SUGERENCIAS}?client=firefox&ds=yt&hl=es&gl=${encodeURIComponent(PAIS)}&q=${encodeURIComponent(q)}`;
  const r = await pedir(url, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`YouTube respondió ${r.status}`);
  // A veces responde en ISO-8859-1 aunque se pida español: se respeta el charset que declara.
  const charset = /charset=([\w-]+)/i.exec(r.headers.get("content-type") ?? "")?.[1] ?? "utf-8";
  const texto = new TextDecoder(charset).decode(await r.arrayBuffer());
  const sugerencias = leerSugerencias(JSON.parse(texto), q);
  if (cache.size > 500) cache.clear();
  cache.set(clave, { hasta: Date.now() + CACHE_MS, sugerencias });
  return sugerencias;
}
