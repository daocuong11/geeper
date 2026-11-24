import { describe, expect, it } from "vitest";
import { compilar } from "@/lib/compilador";
import { aplicarEdicion, Edicion } from "@/lib/ediciones";
import {
  bezier, curvaNiveles, factorVineta, filtroEfectos, JS_BEZIER, mascaraTransicion, matrizTinte, normCdf, pngRuido, rectVisible, scriptEfectos,
} from "@/lib/efectos";
import { aplicarEstilo, pista, validarProyecto, type Proyecto } from "@/lib/esquema";
import { mezclaSimple } from "@/lib/efectos-esquema";
import { clasificarMezcla } from "@/lib/mezcla-auto";
import { PLANTILLAS_INICIALES } from "@/lib/plantillas";
import { proyectoDePrueba } from "./fixtures";

const plantilla = PLANTILLAS_INICIALES[0]!.datos;

/** Aplica una matriz 4×5 de feColorMatrix a un color sRGB 0..1 (sin recorte). */
const aplicar = (m: number[], [r, g, b]: number[]) => [0, 1, 2].map((i) => m[i * 5]! * r! + m[i * 5 + 1]! * g! + m[i * 5 + 2]! * b! + m[i * 5 + 4]!);

describe("curvas (Easy Ease)", () => {
  it("suave es simétrica, empieza y termina con velocidad 0 y la versión JS da lo mismo", () => {
    const f = bezier(1 / 3, 0, 2 / 3, 1);
    expect(f(0.5)).toBeCloseTo(0.5, 6);
    expect(f(0.25) + f(0.75)).toBeCloseTo(1, 6);
    expect(f(0.01)).toBeLessThan(0.001);
    const js = new Function(`${JS_BEZIER}; return geeperBezier;`)() as typeof bezier;
    const g = js(1 / 3, 0, 2 / 3, 1);
    for (let t = 0; t <= 1; t += 0.05) expect(g(t)).toBeCloseTo(f(t), 9);
  });

  it("es monótona en las tres curvas", () => {
    for (const pc of [[1 / 3, 0, 2 / 3, 1], [1 / 3, 0, 5 / 6, 5 / 6], [1 / 6, 1 / 6, 2 / 3, 1]] as const) {
      const f = bezier(pc[0], pc[1], pc[2], pc[3]);
      let prev = -1;
      for (let t = 0; t <= 1.0001; t += 0.01) {
        expect(f(t)).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = f(t);
      }
    }
  });
});

describe("fórmulas de EffectCraft", () => {
  it("normal acumulada", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("tinte: luma 601 llevada entre los dos colores, mezclada por la cantidad", () => {
    const c = [0.8, 0.4, 0.2];
    const l = 0.299 * 0.8 + 0.587 * 0.4 + 0.114 * 0.2;
    // Por defecto (negro → negro, blanco → blanco): blanco y negro por luma.
    for (const v of aplicar(matrizTinte("#000000", "#ffffff", 1), c)) expect(v).toBeCloseTo(l, 3);
    // Sepia a la mitad: (1 − a)·c + a·(negro + (blanco − negro)·l).
    const negro = [0x20 / 255, 0x10 / 255, 0], blanco = [1, 0xe0 / 255, 0xb0 / 255];
    const esperado = c.map((ci, i) => 0.5 * ci + 0.5 * (negro[i]! + (blanco[i]! - negro[i]!) * l));
    aplicar(matrizTinte("#201000", "#ffe0b0", 0.5), c).forEach((v, i) => expect(v).toBeCloseTo(esperado[i]!, 3));
  });

  it("niveles: identidad, recorte y gamma", () => {
    const id = { entradaNegro: 0, entradaBlanco: 1, gamma: 1, salidaNegro: 0, salidaBlanco: 1 };
    expect(curvaNiveles(id, 0.37)).toBeCloseTo(0.37, 9);
    const e = { ...id, entradaNegro: 0.1, entradaBlanco: 0.9, gamma: 2 };
    expect(curvaNiveles(e, 0.05)).toBe(0);
    expect(curvaNiveles(e, 0.95)).toBe(1);
    expect(curvaNiveles(e, 0.5)).toBeCloseTo(Math.sqrt(0.5), 9);
  });

  it("viñeta: 1 en el centro y oscurece hacia las esquinas", () => {
    expect(factorVineta(0.5, 60, 0)).toBe(1);
    // Esquina con ángulo 60°: r = tan 30°, f = (1/(1+r²))² = 0,5625.
    expect(factorVineta(1, 60, 1)).toBeCloseTo(0.5625, 6);
    expect(factorVineta(0.5, 60, 1)).toBeCloseTo(1 - 0.5 * (1 - 0.5625), 6);
  });

  it("grano: el mismo PNG para la misma semilla, otro para otra", () => {
    const a = pngRuido(7, false);
    expect(a.startsWith("data:image/png;base64,iVBORw0KGgo")).toBe(true);
    expect(pngRuido(7, false)).toBe(a);
    expect(pngRuido(8, false)).not.toBe(a);
  });
});

describe("transiciones con máscara", () => {
  it("el rectángulo visible sigue al Ken Burns", () => {
    expect(rectVisible(1080, 1920)).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
    expect(rectVisible(1080, 1920, { scale: 2 })).toEqual({ x: 270, y: 480, w: 540, h: 960 });
    // Desplazado medio ancho a la derecha: se ve la mitad izquierda del elemento.
    const r = rectVisible(1000, 1000, { scale: 2, xPercent: 50 });
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.w).toBe(500);
  });

  it("cada tipo arma una máscara que depende de --gp y cubre el rectángulo visible", () => {
    for (const tipo of ["barrido", "radial", "iris", "persianas"] as const) {
      const m = mascaraTransicion({ tipo, suavizado: 40 }, 1080, 1920, { scale: 1.2 });
      expect(m.estilo).toContain("var(--gp)");
      expect(m.estilo).toContain("mask:");
      expect(m.estilo).toContain("900px 1600px repeat");
      expect(m.desde).toEqual({ "--gp": 0 });
      expect(m.hasta).toEqual({ "--gp": 1 });
    }
  });

  it("el barrido tiene borde gaussiano: de casi opaco a casi transparente", () => {
    const m = mascaraTransicion({ tipo: "barrido", angulo: 90, suavizado: 25 }, 1000, 1000);
    expect(m.estilo).toMatch(/linear-gradient\(90deg, rgb\(0 0 0 \/ 0\.9987\)/);
    expect(m.estilo).toContain("rgb(0 0 0 / 0.5)");
    expect(m.estilo).toContain("rgb(0 0 0 / 0.0013)");
  });
});

describe("filtros de efectos", () => {
  it("encadena los efectos SVG en orden y saca el desenfoque al CSS", () => {
    const fx = filtroEfectos("v-e01-0", [
      { tipo: "tinte", negro: "#000000", blanco: "#ffffff", cantidad: 1 },
      { tipo: "vineta", cantidad: 0.5, angulo: 60 },
      { tipo: "desenfoque", radio: 4 },
      { tipo: "grano", cantidad: 0.1, color: false, semilla: 3 },
    ], 1080, 1920, { t: 2, dur: 3 });
    expect(fx.defs).toContain('id="fx-v-e01-0"');
    expect(fx.defs).toContain('color-interpolation-filters="sRGB"');
    expect(fx.defs.indexOf("feColorMatrix")).toBeLessThan(fx.defs.indexOf("feImage"));
    expect(fx.defs).toContain("feTile");
    expect(fx.css).toBe("url(#fx-v-e01-0) blur(4px)");
    expect(fx.granos).toEqual([{ id: "v-e01-0-grano0", t: 2, dur: 3, semilla: 3 }]);
    expect(scriptEfectos(fx.granos, 30)).toContain('"n":90');
  });

  it("sin efectos no deja filtro", () => {
    expect(filtroEfectos("x", [], 10, 10)).toEqual({ defs: "", css: "", granos: [] });
  });
});

describe("compilador con efectos de EffectCraft", () => {
  function conTodo(): Proyecto {
    const p = proyectoDePrueba();
    const vis = pista(p, "visual")!.clips;
    vis[1]!.transicion = { tipo: "barrido", duracion: 0.5, angulo: 135, suavizado: 60 };
    vis[1]!.movimiento = { desde: { escala: 1.2, x: 0, y: 0 }, hasta: { escala: 1, x: 0, y: 0 }, curva: "suave" };
    vis[2]!.transicion = { tipo: "iris", duracion: 0.6 };
    vis[0]!.efectos = [{ tipo: "tinte", negro: "#1a1000", blanco: "#fff0d0", cantidad: 0.8 }, { tipo: "grano", cantidad: 0.1, color: false, semilla: 1 }];
    p.pistas.push({ id: "luces", tipo: "video", clips: [{ id: "l1", asset: "clip-01", inicio: 1, rango: { inicio: 0, duracion: 2 }, fusion: "trama", opacidad: 0.6 }] });
    return validarProyecto(JSON.parse(JSON.stringify(p)));
  }

  it("el esquema acepta los campos nuevos y un proyecto viejo sigue igual", () => {
    const p = conTodo();
    expect(pista(p, "visual")!.clips[1]!.transicion?.tipo).toBe("barrido");
    expect(() => validarProyecto({ ...p, pistas: [{ ...p.pistas[0]!, clips: [{ ...p.pistas[0]!.clips[0]!, fusion: "rara" }] }, ...p.pistas.slice(1)] })).toThrow();
    const viejo = compilar(proyectoDePrueba(), plantilla, "/tmp/m.wav", "/tmp/p").html;
    expect(viejo).not.toContain("<filter");
    expect(viejo).not.toContain("mask:");
  });

  it("compila máscara, curva, filtros, grano y fusión", () => {
    const { html } = compilar(conTodo(), plantilla, "/tmp/m.wav", "/tmp/p");
    expect(html).toContain("linear-gradient(135deg");
    expect(html).toContain("radial-gradient(circle");
    // La máscara de la escena 2 se ajusta al Ken Burns (escala 1,2 al empezar).
    expect(html).toContain("900px 1600px repeat");
    expect(html).toContain('"ease":"geeper.suave"');
    expect(html).toContain('gsap.registerEase("geeper.suave"');
    expect(html).toMatch(/<filter id="fx-v-e01-0"/);
    expect(html).toMatch(/id="v-e01-0"[^>]*filter: url\(#fx-v-e01-0\)/);
    expect(html).toContain("mix-blend-mode: screen;");
    expect(html).toContain('"id":"v-e01-0-grano0"');
  });
});

describe("ediciones con efectos", () => {
  it("efectosVisual guarda curva y efectos, y los quita con null", () => {
    const p = proyectoDePrueba();
    const mov = { desde: { escala: 1, x: 0, y: 0 }, hasta: { escala: 1.15, x: 0, y: 0 }, curva: "suave" };
    const efectos = [{ tipo: "grano", cantidad: 0.1 }];
    const q = aplicarEdicion(p, Edicion.parse({ tipo: "efectosVisual", escena: "e02", movimiento: mov, efectos }));
    const c = pista(q, "visual")!.clips[1]!;
    expect(c.movimiento?.curva).toBe("suave");
    expect(c.efectos).toEqual([{ tipo: "grano", cantidad: 0.1, color: false, semilla: 1 }]);
    const r = aplicarEdicion(q, Edicion.parse({ tipo: "efectosVisual", escena: "e02", efectos: null }));
    expect(pista(r, "visual")!.clips[1]!.efectos).toBeUndefined();
  });
});

describe("estilo del video", () => {
  const conEstilo = () => {
    let p = proyectoDePrueba();
    p = aplicarEdicion(p, Edicion.parse({ tipo: "estiloVideo", efectos: [{ tipo: "grano", cantidad: 0.1 }], transicion: { tipo: "iris", duracion: 0.6 }, curva: "suave" }));
    return aplicarEdicion(p, Edicion.parse({ tipo: "efectosVisual", escena: "e01", movimiento: { desde: { escala: 1 }, hasta: { escala: 1.15 } } }));
  };

  it("las escenas sin valor propio heredan; la primera no tiene entrada", () => {
    const q = aplicarEstilo(conEstilo());
    const vis = pista(q, "visual")!.clips;
    expect(vis[0]!.transicion).toBeUndefined();
    expect(vis[1]!.transicion?.tipo).toBe("iris");
    expect(vis.every((c) => c.efectos?.[0]?.tipo === "grano")).toBe(true);
    expect(vis[0]!.movimiento?.curva).toBe("suave");
  });

  it("una excepción gana, «sin efectos» ([]) también, y null vuelve al estilo", () => {
    let p = conEstilo();
    p = aplicarEdicion(p, Edicion.parse({ tipo: "efectosVisual", escena: "e02", transicion: { tipo: "fundido", duracion: 0.5 }, efectos: [] }));
    p = aplicarEdicion(p, Edicion.parse({ tipo: "efectosVisual", escena: "e01", curva: "frena" }));
    let vis = pista(aplicarEstilo(p), "visual")!.clips;
    expect(vis[1]!.transicion?.tipo).toBe("fundido");
    expect(vis[1]!.efectos).toEqual([]);
    expect(vis[0]!.movimiento?.curva).toBe("frena");
    p = aplicarEdicion(p, Edicion.parse({ tipo: "efectosVisual", escena: "e02", transicion: null, efectos: null }));
    p = aplicarEdicion(p, Edicion.parse({ tipo: "efectosVisual", escena: "e01", curva: null }));
    vis = pista(aplicarEstilo(p), "visual")!.clips;
    expect(vis[1]!.transicion?.tipo).toBe("iris");
    expect(vis[1]!.efectos?.[0]?.tipo).toBe("grano");
    expect(vis[0]!.movimiento?.curva).toBe("suave");
  });

  it("quitar todo el estilo deja el proyecto como antes y el compilador lo usa", () => {
    const p = conEstilo();
    const { html } = compilar(p, plantilla, "/tmp/m.wav", "/tmp/p");
    expect(html).toContain("radial-gradient(circle");
    expect(html).toContain('"ease":"geeper.suave"');
    const sin = aplicarEdicion(p, Edicion.parse({ tipo: "estiloVideo", efectos: null, transicion: null, curva: null }));
    expect(sin.estilo).toBeUndefined();
    expect(compilar(sin, plantilla, "/tmp/m.wav", "/tmp/p").html).not.toContain("<filter");
    // Un proyecto viejo (sin estilo) no cambia.
    expect(aplicarEstilo(proyectoDePrueba())).toEqual(proyectoDePrueba());
  });
});

describe("superposiciones", () => {
  const conLibre = () => {
    const p = proyectoDePrueba();
    p.pistas.push({ id: "broll", tipo: "video", clips: [{ id: "broll-1", asset: "clip-01", inicio: 1, rango: { inicio: 0, duracion: 2 } }] });
    return validarProyecto(JSON.parse(JSON.stringify(p)));
  };

  it("editarClipLibre cambia la mezcla, la entrada y el aspecto", () => {
    let p = aplicarEdicion(conLibre(), Edicion.parse({ tipo: "editarClipLibre", clip: "broll-1", fusion: "trama", transicion: { tipo: "iris", duracion: 0.5 }, efectos: [{ tipo: "desenfoque", radio: 3 }] }));
    let c = pista(p, "broll")!.clips[0]!;
    expect(c.fusion).toBe("trama");
    expect(c.transicion?.tipo).toBe("iris");
    p = aplicarEdicion(p, Edicion.parse({ tipo: "editarClipLibre", clip: "broll-1", fusion: "normal", efectos: null, transicion: null }));
    c = pista(p, "broll")!.clips[0]!;
    expect([c.fusion, c.efectos, c.transicion]).toEqual([undefined, undefined, undefined]);
    expect(() => aplicarEdicion(p, Edicion.parse({ tipo: "editarClipLibre", clip: "no-existe", fusion: "trama" }))).toThrow(/No hay una superposición/);
  });

  it("la mezcla automática mira el fondo", () => {
    const muestra = (r: number, g: number, b: number, a = 255, n = 100) => new Uint8Array(Array.from({ length: n }, () => [r, g, b, a]).flat());
    expect(clasificarMezcla(muestra(5, 5, 5)).mezcla).toBe("aclarar");
    expect(clasificarMezcla(muestra(250, 250, 250)).fusion).toBe("multiplicar");
    expect(clasificarMezcla(muestra(120, 80, 60)).mezcla).toBe("normal");
    expect(clasificarMezcla(muestra(0, 0, 0, 0)).motivo).toMatch(/transparencia/);
    expect(mezclaSimple("trama")).toBe("aclarar");
    expect(mezclaSimple("diferencia")).toBeNull();
  });
});
