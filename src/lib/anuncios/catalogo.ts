/**
 * Catálogo de la sección Anuncios: ubicaciones, objetivos, marcos de copy, categorías sensibles y
 * fuentes oficiales. Viene de AgriciDaniel/claude-ads (MIT, ver docs/ANUNCIOS.md).
 *
 * Regla heredada: aquí NO se congelan límites volátiles (duración máxima, peso, caracteres). Cada
 * ubicación guarda sólo lo estable (su formato nativo y qué interfaz la tapa) y el enlace a la fuente
 * oficial; el límite vigente lo verifica la persona y lo anota con fecha en la revisión.
 */
import type { Formato, Plataforma } from "../esquema";

export interface Ubicacion {
  id: string;
  red: "youtube" | "tiktok" | "instagram" | "facebook" | "linkedin";
  nombre: string;
  /** Formato nativo de la ubicación (el que Geeper renderiza). */
  formato: Formato;
  /** Interfaz cuya banda segura mide el QC en 9:16; null = Geeper no la conoce. */
  plataforma: Plataforma | null;
  specs: string;
  politicas: string;
}

const GOOGLE_SPECS = "https://support.google.com/adspolicy/answer/6368661";
const GOOGLE_POL = "https://support.google.com/adspolicy/";
const META_REELS = "https://www.facebook.com/business/ads/facebook-instagram-reels-ads";
const META_GUIA = "https://www.facebook.com/business/ads-guide";
const META_POL = "https://transparency.meta.com/policies/ad-standards/";
const TIKTOK_SPECS = "https://ads.tiktok.com/resources/help/article/tiktok-ads-policy-ad-format-and-functionality";
const TIKTOK_POL = "https://ads.tiktok.com/help/article/tiktok-advertising-policies-industry-entry";
const LINKEDIN_SPECS = "https://business.linkedin.com/advertise/ads/ads-guide";
const LINKEDIN_POL = "https://www.linkedin.com/legal/ads-policy";

export const UBICACIONES: readonly Ubicacion[] = [
  { id: "youtube-shorts", red: "youtube", nombre: "YouTube Shorts", formato: "9:16", plataforma: "youtube", specs: GOOGLE_SPECS, politicas: GOOGLE_POL },
  { id: "youtube-instream", red: "youtube", nombre: "YouTube in-stream", formato: "16:9", plataforma: null, specs: GOOGLE_SPECS, politicas: GOOGLE_POL },
  { id: "tiktok-infeed", red: "tiktok", nombre: "TikTok In-Feed", formato: "9:16", plataforma: "tiktok", specs: TIKTOK_SPECS, politicas: TIKTOK_POL },
  { id: "instagram-reels", red: "instagram", nombre: "Instagram Reels", formato: "9:16", plataforma: "instagram", specs: META_REELS, politicas: META_POL },
  { id: "instagram-stories", red: "instagram", nombre: "Instagram Stories", formato: "9:16", plataforma: "instagram", specs: META_GUIA, politicas: META_POL },
  { id: "instagram-feed", red: "instagram", nombre: "Instagram Feed", formato: "1:1", plataforma: null, specs: META_GUIA, politicas: META_POL },
  { id: "facebook-reels", red: "facebook", nombre: "Facebook Reels", formato: "9:16", plataforma: "facebook", specs: META_REELS, politicas: META_POL },
  { id: "facebook-stories", red: "facebook", nombre: "Facebook Stories", formato: "9:16", plataforma: "facebook", specs: META_GUIA, politicas: META_POL },
  { id: "facebook-feed", red: "facebook", nombre: "Facebook Feed", formato: "1:1", plataforma: null, specs: META_GUIA, politicas: META_POL },
  { id: "linkedin-video", red: "linkedin", nombre: "LinkedIn video", formato: "1:1", plataforma: null, specs: LINKEDIN_SPECS, politicas: LINKEDIN_POL },
];

export const IDS_UBICACION = UBICACIONES.map((u) => u.id) as [string, ...string[]];

export function ubicacion(id: string): Ubicacion | undefined {
  return UBICACIONES.find((u) => u.id === id);
}

export const OBJETIVOS = {
  reconocimiento: "Reconocimiento",
  trafico: "Tráfico",
  interaccion: "Interacción",
  clientes: "Clientes potenciales",
  ventas: "Ventas",
  app: "Instalaciones de app",
} as const;

/** Categorías que piden revisión de política más a fondo (claude-ads, compliance.md). */
export const CATEGORIAS_SENSIBLES = {
  ninguna: "Ninguna",
  salud: "Salud y bienestar",
  finanzas: "Productos financieros o crédito",
  vivienda: "Vivienda",
  empleo: "Empleo",
  alcohol: "Alcohol",
  apuestas: "Apuestas",
  politica: "Política o temas sociales",
  menores: "Dirigido a menores",
  citas: "Citas",
  cripto: "Cripto",
  suscripciones: "Suscripciones",
  otra: "Otra regulada",
} as const;

/** Botones de llamado a la acción más comunes; el texto exacto lo elige la red. */
export const BOTONES_CTA = ["Más información", "Comprar", "Registrarte", "Descargar", "Reservar", "Contactar", "Ver más", "Suscribirte", "Instalar"] as const;

/**
 * Marcos de copy como preguntas (claude-ads, copy-frameworks.md): ordenan un mensaje ya aprobado, no
 * prueban que persuada ni que gane. Se puede no usar ninguno.
 */
export const MARCOS: Record<string, { nombre: string; preguntas: string[]; riesgos: string }> = {
  ninguno: { nombre: "Sin marco", preguntas: [], riesgos: "" },
  aida: {
    nombre: "Atención · Interés · Deseo · Acción",
    preguntas: [
      "¿Qué gana la atención sin engañar ni inventar urgencia?",
      "¿Qué detalle relevante ayuda a entender la oferta?",
      "¿Qué beneficio aprobado conecta ese detalle con lo que busca la audiencia?",
      "¿Qué acción describe con exactitud el siguiente paso?",
    ],
    riesgos: "Ganchos sensacionalistas, garantías implícitas, condiciones ocultas, varias acciones a la vez.",
  },
  pas: {
    nombre: "Problema · Agitación · Solución",
    preguntas: [
      "¿Qué problema respaldan los datos de la audiencia?",
      "¿Se puede contar su consecuencia sin miedo, vergüenza ni exagerar?",
      "¿Cómo lo resuelve la oferta aprobada y qué límites importan?",
    ],
    riesgos: "Dolor inventado, presión manipuladora, lenguaje sobre rasgos sensibles, solución más fuerte que la prueba.",
  },
  bab: {
    nombre: "Antes · Después · Puente",
    preguntas: [
      "¿Qué situación actual está documentada y se puede describir?",
      "¿Qué situación deseada es plausible (no garantizada)?",
      "¿Qué mecanismo aprobado une las dos?",
    ],
    riesgos: "Transformaciones irreales, plazos inventados, imágenes alteradas.",
  },
  "4p": {
    nombre: "Promesa · Imagen · Prueba · Empuje",
    preguntas: [
      "¿Qué promesa acotada está demostrada?",
      "¿Qué escena ilustra el beneficio sin presentar ficción como hecho?",
      "¿Qué prueba se puede citar con exactitud y con su aclaración?",
      "¿Qué siguiente paso sigue sin presionar?",
    ],
    riesgos: "Resultados sin matices, clientes ficticios, prueba inaccesible.",
  },
  fab: {
    nombre: "Característica · Ventaja · Beneficio",
    preguntas: [
      "¿Qué característica verificada le importa a esta audiencia?",
      "¿Qué diferencia documentada se sigue de ella?",
      "¿Qué beneficio acotado se puede decir sin inventar un resultado?",
    ],
    riesgos: "Comparaciones sin respaldo, jerga, funciones que varían por plan o región.",
  },
  historia: {
    nombre: "Persona · Historia · Solución",
    preguntas: [
      "¿La persona es real, dio su consentimiento y está bien representada?",
      "¿Qué reto y contexto aprobados se pueden contar?",
      "¿Cómo entra el producto sin exagerar la causa?",
    ],
    riesgos: "Testimonios ficticios, patrocinio no declarado, imagen sintética de una persona, dramatización engañosa.",
  },
};

/** Variables que puede cambiar una prueba (una sola por prueba). */
export const VARIABLES_PRUEBA = {
  gancho: "Gancho (primeros segundos)",
  oferta: "Oferta",
  cta: "Llamado a la acción",
  formato: "Formato o ubicación",
  voz: "Voz",
  plantilla: "Plantilla visual",
  otra: "Otra",
} as const;

export const UNIDADES_PRUEBA = {
  usuario: "Persona (usuario)",
  geo: "Región (geo)",
  campana: "Campaña o conjunto de anuncios",
} as const;
