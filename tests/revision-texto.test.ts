import { describe, expect, it } from "vitest";
import { arreglar, bloquea, contarHashtags, contarMenciones, dejarHashtags, normalizarTitulo, recortarHasta, revisarTexto } from "../src/lib/redes/revision-texto";

const ids = (x: Parameters<typeof revisarTexto>[0]) => revisarTexto(x).map((p) => p.id);
const tags = (n: number) => Array.from({ length: n }, (_, i) => `#tag${i}`).join(" ");

describe("revisión del texto antes de publicar", () => {
  it("un título y una descripción normales no dan problemas", () => {
    expect(revisarTexto({ red: "youtube", titulo: "Cómo hacer pan casero", descripcion: "Receta en 3 pasos. #pan #receta" })).toEqual([]);
  });

  it("sin título bloquea la publicación", () => {
    const ps = revisarTexto({ red: "tiktok", titulo: "   ", descripcion: "" });
    expect(ps.map((p) => p.id)).toEqual(["sin-titulo"]);
    expect(bloquea(ps)).toBe(true);
  });

  it("avisa de un título repetido en la cuenta aunque cambien tildes, mayúsculas y signos", () => {
    const ps = revisarTexto({ red: "youtube", titulo: "¡Cómo hacer PAN casero!", descripcion: "x", titulosPrevios: ["Otro", "como hacer pan casero"] });
    expect(ps.map((p) => p.id)).toEqual(["titulo-repetido"]);
    expect(ps[0]!.que).toContain("«como hacer pan casero»");
    expect(bloquea(ps)).toBe(false);
  });

  it("YouTube: signos < >, título que se corta, sin descripción", () => {
    expect(ids({ red: "youtube", titulo: "a < b", descripcion: "x" })).toEqual(["yt-angulos"]);
    expect(ids({ red: "youtube", titulo: "a".repeat(71), descripcion: "x" })).toEqual(["yt-titulo-largo"]);
    expect(ids({ red: "youtube", titulo: "a".repeat(70), descripcion: "x" })).toEqual([]);
    expect(ids({ red: "youtube", titulo: "Pan", descripcion: "  " })).toEqual(["yt-sin-descripcion"]);
  });

  it("YouTube cuenta la descripción en bytes, no en caracteres", () => {
    expect(ids({ red: "youtube", titulo: "Pan", descripcion: "a".repeat(5000) })).toEqual([]);
    expect(ids({ red: "youtube", titulo: "Pan", descripcion: "á".repeat(2501) })).toEqual(["yt-descripcion-larga"]);
  });

  it("YouTube ignora todos los hashtags si hay más de 60 (título incluido)", () => {
    expect(ids({ red: "youtube", titulo: "Pan #a", descripcion: tags(59) })).toEqual([]);
    expect(ids({ red: "youtube", titulo: "Pan #a", descripcion: tags(60) })).toEqual(["yt-hashtags"]);
  });

  it("TikTok e Instagram cuentan título y descripción juntos", () => {
    expect(ids({ red: "tiktok", titulo: "a".repeat(100), descripcion: "b".repeat(2098) })).toEqual([]);
    expect(ids({ red: "tiktok", titulo: "a".repeat(100), descripcion: "b".repeat(2099) })).toEqual(["tt-largo"]);
    expect(ids({ red: "instagram", titulo: "a".repeat(100), descripcion: "b".repeat(2099) })).toEqual(["ig-largo"]);
  });

  it("Instagram rechaza más de 30 hashtags o 20 menciones: bloquea", () => {
    expect(ids({ red: "instagram", titulo: "Pan", descripcion: tags(30) })).toEqual([]);
    const ps = revisarTexto({ red: "instagram", titulo: "Pan", descripcion: tags(31) });
    expect(ps.map((p) => p.id)).toEqual(["ig-hashtags"]);
    expect(bloquea(ps)).toBe(true);
    const menciones = Array.from({ length: 21 }, (_, i) => `@user${i}`).join(" ");
    expect(ids({ red: "instagram", titulo: "Pan", descripcion: menciones })).toEqual(["ig-menciones"]);
  });

  it("Facebook sólo revisa título y duplicados", () => {
    expect(ids({ red: "facebook", titulo: "a".repeat(300), descripcion: tags(100) })).toEqual([]);
  });
});

describe("conteos", () => {
  it("hashtags: no cuenta anclas de URL, entidades HTML ni el # suelto", () => {
    expect(contarHashtags("#uno y #dos_2 #ñandú")).toBe(3);
    expect(contarHashtags("https://x.com/p#seccion &#123; # solo")).toBe(0);
  });
  it("menciones: no cuenta correos", () => {
    expect(contarMenciones("hola @ana y @luis.p")).toBe(2);
    expect(contarMenciones("escribe a correo@dimerso.com")).toBe(0);
  });
  it("normaliza títulos", () => {
    expect(normalizarTitulo("  ¿Qué  PASÓ?! ")).toBe("que paso");
  });
});

describe("arreglos de un clic", () => {
  it("cada problema con botón queda resuelto después de arreglarlo", () => {
    const casos = [
      { red: "youtube", titulo: "", descripcion: "x", tituloSugerido: "Pan casero" },
      { red: "youtube", titulo: "a <b>", descripcion: "c > d" },
      { red: "youtube", titulo: "Pan", descripcion: "", descripcionSugerida: "Receta de pan" },
      { red: "youtube", titulo: "Pan", descripcion: "palabra ".repeat(400) + "á".repeat(1000) },
      { red: "youtube", titulo: "Pan #a", descripcion: `Receta ${tags(70)}` },
      { red: "tiktok", titulo: "Pan", descripcion: "palabra ".repeat(400) },
      { red: "instagram", titulo: "Pan", descripcion: "palabra ".repeat(400) },
      { red: "instagram", titulo: "Pan", descripcion: tags(40) },
    ];
    for (const t of casos) {
      const antes = revisarTexto(t).filter((p) => p.arreglo);
      expect(antes.length, JSON.stringify(t).slice(0, 60)).toBeGreaterThan(0);
      for (const p of antes) {
        const nuevo = { ...t, ...arreglar(t, p.id) };
        expect(revisarTexto(nuevo).map((x) => x.id)).not.toContain(p.id);
      }
    }
  });

  it("sin sugerencia no ofrece botón", () => {
    expect(revisarTexto({ red: "youtube", titulo: "", descripcion: "x" })[0]!.arreglo).toBeUndefined();
    expect(revisarTexto({ red: "youtube", titulo: "Pan", descripcion: "" })[0]!.arreglo).toBeUndefined();
  });

  it("deja los primeros hashtags y no toca el resto del texto", () => {
    expect(dejarHashtags("Receta #pan #casero #masa fin", 2)).toBe("Receta #pan #casero fin");
    expect(arreglar({ red: "youtube", titulo: "Pan #a #b", descripcion: tags(70) }, "yt-hashtags").descripcion).toBe("#tag0 #tag1 #tag2");
  });

  it("recorta sin partir palabras", () => {
    expect(recortarHasta("uno dos tres", (t) => t.length <= 9)).toBe("uno dos");
    expect(recortarHasta("corto", () => true)).toBe("corto");
  });
});
