import { describe, expect, it, vi } from "vitest";
import { leerSugerencias, sugerenciasYoutube } from "../src/lib/busquedas";
import { cambiarUltimaLinea, ultimaLinea } from "../src/components/sugerencias-busqueda";

describe("lo que busca la gente (autocompletado de YouTube)", () => {
  it("lee la respuesta, quita la consulta propia, repetidas y basura", () => {
    const r = ["pan casero", ["pan casero", "Pan casero esponjoso", "pan  casero   sin horno", "pan casero esponjoso", 3, ""], [], {}];
    expect(leerSugerencias(r, "Pan Casero")).toEqual(["Pan casero esponjoso", "pan casero sin horno"]);
    expect(leerSugerencias({ x: 1 }, "pan")).toEqual([]);
    expect(leerSugerencias(null, "pan")).toEqual([]);
  });

  it("no consulta con menos de 3 letras y guarda el resultado una hora", async () => {
    const pedir = vi.fn(async () => new Response(JSON.stringify(["faros", ["faros antiguos", "faros hoteles"]]), { headers: { "content-type": "text/javascript; charset=UTF-8" } }));
    expect(await sugerenciasYoutube("fa", pedir as unknown as typeof fetch)).toEqual([]);
    expect(await sugerenciasYoutube("faros", pedir as unknown as typeof fetch)).toEqual(["faros antiguos", "faros hoteles"]);
    expect(await sugerenciasYoutube(" Faros ", pedir as unknown as typeof fetch)).toEqual(["faros antiguos", "faros hoteles"]);
    expect(pedir).toHaveBeenCalledTimes(1);
    const url = String((pedir.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("ds=yt");
    expect(url).toContain("q=faros");
  });

  it("respeta el charset que declara la respuesta", async () => {
    const latin1 = Uint8Array.from(Buffer.from(JSON.stringify(["cafe", ["café de olla"]]), "latin1"));
    const pedir = vi.fn(async () => new Response(latin1, { headers: { "content-type": "text/javascript; charset=ISO-8859-1" } }));
    expect(await sugerenciasYoutube("cafe latino", pedir as unknown as typeof fetch)).toEqual(["café de olla"]);
  });

  it("si Google falla, lanza (la ruta lo convierte en lista vacía)", async () => {
    const pedir = vi.fn(async () => new Response("", { status: 429 }));
    await expect(sugerenciasYoutube("tema que falla", pedir as unknown as typeof fetch)).rejects.toThrow("429");
  });

  it("en un lote, la sugerencia cambia sólo la línea que se escribe", () => {
    expect(ultimaLinea("uno\ndos")).toBe("dos");
    expect(cambiarUltimaLinea("uno\ndo", "dos casero")).toBe("uno\ndos casero");
    expect(cambiarUltimaLinea("", "x")).toBe("x");
  });
});
