import { expect, it } from "vitest";
import { segmentar } from "@/lib/segmentar";

const palabras = Array.from({ length: 60 }, (_, i) => ({ texto: `p${i}`, inicio: i * 0.5, fin: i * 0.5 + (i % 7 === 6 ? 0.2 : 0.45) }));

it("corta cerca de cada clip, en pausas, sin perder palabras", () => {
  const t = segmentar(palabras, 30, 6);
  expect(t.length).toBeGreaterThanOrEqual(4);
  expect(t[0]!.inicio).toBe(0);
  expect(t[t.length - 1]!.fin).toBe(30);
  expect(t.flatMap((x) => x.palabras).length).toBe(60);
  for (let i = 1; i < t.length; i++) {
    expect(t[i]!.inicio).toBe(t[i - 1]!.fin);
    // El corte no cae dentro de una palabra.
    expect(palabras.some((w) => w.inicio < t[i]!.inicio - 1e-9 && w.fin > t[i]!.inicio + 1e-9)).toBe(false);
  }
});
