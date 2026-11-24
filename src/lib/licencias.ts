/** Licencias conocidas por modelo (detalle y fuentes en MODELOS.md). */
export const LICENCIAS: Record<string, string> = {
  "z-image-turbo": "Apache-2.0 (Tongyi-MAI/Z-Image-Turbo, vía MPT)",
  realvisxl: "OpenRAIL++-M (RealVisXL V5 Lightning, vía MPT)",
  kokoro: "Apache-2.0 (Kokoro-82M)",
  "wan2.2-ti2v-5b": "Apache-2.0 (Wan-AI/Wan2.2-TI2V-5B)",
  archivo: "propia (subida por la persona)",
};

export type UsoComercial = "si" | "no" | "desconocido";

/**
 * ¿Se puede usar con fines comerciales? Lee el texto libre de `Asset.licencia`. Lo que no reconoce
 * queda «desconocido»: con `comercial: true` el QC lo bloquea igual que un «no» (BRECHAS.md Q1).
 * OpenRAIL permite uso comercial con restricciones de uso (PRODUCTO.md §9).
 */
export function usoComercial(licencia: string): UsoComercial {
  const l = licencia.toLowerCase();
  if (/desconocid|revisar|unknown|\?/.test(l)) return "desconocido";
  if (/\bnc\b|-nc\b|non-?commercial|no comercial|no-comercial|sólo editorial|solo editorial|editorial only|research only|sólo investigación|cpml/.test(l)) return "no";
  if (/apache|\bmit\b|cc0|public domain|dominio público|\bbsd\b|openrail|\bcc-by\b|cc by|propia|permiso del creador|biblioteca de audio de youtube|youtube audio library|pixabay|pexels/.test(l)) return "si";
  return "desconocido";
}

export function licenciaImagenMpt(modelo: string | undefined): string {
  const m = (modelo ?? "").toLowerCase();
  if (m.includes("z-image")) return LICENCIAS["z-image-turbo"]!;
  if (m.includes("realvis")) return LICENCIAS.realvisxl!;
  return `revisar: modelo de imagen de MPT «${modelo ?? "?"}»`;
}
