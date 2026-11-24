/**
 * Campaña de ejemplo para aprender (ficticia: marca, cifras y resultados inventados a propósito y
 * marcados como tales). No tiene videos: muestra cómo se ven el brief, las ideas, la revisión y la prueba.
 */
import { DatosCampana, type DatosCampana as Datos } from "./esquema";

export const NOMBRE_EJEMPLO = "Ejemplo · Café Aurora (ficticio)";

export function datosEjemplo(): Datos {
  return DatosCampana.parse({
    brief: {
      marca: "Café Aurora (marca ficticia)",
      producto: "Café de especialidad molido, con envío a domicilio",
      objetivo: "ventas",
      audiencia: "Personas que toman café en casa todos los días y hoy lo compran en el supermercado. Lo sabemos por las preguntas que llegan por mensaje.",
      oferta: "Primera bolsa con 20 % de descuento (ejemplo).",
      destino: "https://example.com",
      botonCta: "Comprar",
      ubicaciones: ["instagram-reels", "tiktok-infeed", "youtube-shorts"],
      categoria: "ninguna",
      afirmaciones: [
        { id: "af-tueste", texto: "Tostado la semana en que lo pides", prueba: "Fecha de tueste impresa en cada bolsa (ejemplo)", aprobada: true },
        { id: "af-envio", texto: "Envío gratis a todo el país", prueba: "Política de envíos (ejemplo)", aprobada: true },
        { id: "af-mejor", texto: "El mejor café del país", prueba: "", aprobada: false },
      ],
      notas: "Esta campaña es un ejemplo para aprender. Bórrala cuando quieras.",
    },
    conceptos: [
      {
        id: "c-frio", nombre: "¿Sabe a nada?", marco: "pas",
        insight: "Mucha gente cree que el café «es así» porque nunca probó uno recién tostado.",
        gancho: "¿Tu café de la mañana sabe a nada?",
        promesa: "Café con sabor de verdad, tostado la semana en que lo pides.",
        pruebas: ["af-tueste", "af-envio"],
        cta: "Pide tu primera bolsa",
        guion: "¿Tu café de la mañana sabe a nada? No es tu culpa: el del supermercado lleva meses tostado. El nuestro se tuesta la semana en que lo pides, y el envío es gratis a todo el país. Pide tu primera bolsa.",
        hipotesis: "Nombrar el problema del sabor hace que más gente se quede a ver el video.",
        principal: "instagram-reels",
      },
      {
        id: "c-ritual", nombre: "Tres minutos tuyos", marco: "bab",
        insight: "La mañana es el único rato tranquilo de mucha gente.",
        gancho: "Tres minutos que son sólo tuyos",
        promesa: "Un café que vale la pena esperar.",
        pruebas: ["af-tueste"],
        cta: "Pide tu primera bolsa",
        guion: "Tres minutos que son sólo tuyos. Agua caliente, el olor del café recién molido, y la casa todavía en silencio. Tostado la semana en que lo pides. Pide tu primera bolsa.",
        hipotesis: "Hablar del momento, y no del producto, atrae a quien valora la calma.",
        principal: "tiktok-infeed",
      },
    ],
    prueba: {
      decision: "Con qué idea invertimos el presupuesto de diciembre",
      hipotesis: "Nombrar el problema del sabor consigue más clics que hablar del ritual.",
      variable: "gancho",
      control: "c-ritual",
      tratamientos: ["c-frio"],
      metrica: "Clics en «Comprar»",
      guardarrailes: "Que el costo por compra no suba más de 15 %",
      tasaBase: 1.2,
      efectoMinimo: 25,
      volumenDiario: 4000,
      resultados: { "c-ritual": { unidades: 24000, conversiones: 288 }, "c-frio": { unidades: 24000, conversiones: 372 } },
      guardarrailesOk: "pass",
      reglaParada: "Se termina al llegar a la muestra de cada variante, no antes.",
    },
  });
}
