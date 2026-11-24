export type CommercialUse = "yes" | "no" | "unknown";

/**
 * Whether a free-text license string allows commercial use. Anything it doesn't recognize is
 * "unknown". OpenRAIL counts as commercial (with use restrictions). Understands English and Spanish.
 */
export function commercialUse(license: string): CommercialUse {
  const l = license.toLowerCase();
  if (/desconocid|revisar|unknown|\?/.test(l)) return "unknown";
  if (/\bnc\b|-nc\b|non-?commercial|no comercial|no-comercial|sólo editorial|solo editorial|editorial only|research only|sólo investigación|cpml/.test(l)) return "no";
  if (/apache|\bmit\b|cc0|public domain|dominio público|\bbsd\b|openrail|\bcc-by\b|cc by|propia|own work|permiso del creador|creator permission|youtube audio library|biblioteca de audio de youtube|pixabay|pexels/.test(l)) return "yes";
  return "unknown";
}
