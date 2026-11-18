/** Licencias conocidas por modelo (detalle y fuentes en MODELOS.md). */
export const LICENCIAS: Record<string, string> = {
  "z-image-turbo": "Apache-2.0 (Tongyi-MAI/Z-Image-Turbo, vía MPT)",
  realvisxl: "OpenRAIL++-M (RealVisXL V5 Lightning, vía MPT)",
  kokoro: "Apache-2.0 (Kokoro-82M)",
  "wan2.2-ti2v-5b": "Apache-2.0 (Wan-AI/Wan2.2-TI2V-5B)",
  archivo: "propia (subida por la persona)",
};

export function licenciaImagenMpt(modelo: string | undefined): string {
  const m = (modelo ?? "").toLowerCase();
  if (m.includes("z-image")) return LICENCIAS["z-image-turbo"]!;
  if (m.includes("realvis")) return LICENCIAS.realvisxl!;
  return `revisar: modelo de imagen de MPT «${modelo ?? "?"}»`;
}
