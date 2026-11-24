import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aplicarFocos, autoCaras, cubreConCara, encuadreDe, escenasQueCambian, faltaAuto, porAnalizar, posicionCara, sigueCara, sinSeguirCaras, visibleDe, YUNET } from "@/lib/caras";
import { compilar } from "@/lib/compilador";
import { aplicarEdicion } from "@/lib/ediciones";
import { pista, validarProyecto, type Asset, type Proyecto } from "@/lib/esquema";
import { PLANTILLAS_INICIALES } from "@/lib/plantillas";
import { proyectoDePrueba } from "./fixtures";

const plantilla = PLANTILLAS_INICIALES[0]!.datos;
/** Lo que midió py/caras.py sobre un 1920×1080 con la cara a la derecha (prueba manual del 2026-11-19). */
const CARA_DERECHA = { x: 0.7279, y: 0.2888, ancho: 0.0826, confianza: 0.92, cobertura: 1, dispersion: 0, muestras: 45 };

/** El proyecto de prueba (9:16) con clip-02 horizontal, como un clip propio 16:9. */
function conClipHorizontal(): Proyecto {
  const p = proyectoDePrueba();
  p.assets["clip-02"] = { ...p.assets["clip-02"]!, ancho: 1920, alto: 1080 };
  return validarProyecto(p);
}

const asset = (a: Partial<Asset>): Asset => ({ id: "a", tipo: "video", ruta: "assets/a.mp4", hash: "a".repeat(64), source: "archivo", licencia: "x", regenerar: {}, ancho: 1920, alto: 1080, ...a });

describe("reencuadre por cara (E4)", () => {
  it("YuNet queda fijado a un commit, con tamaño y SHA-256", () => {
    expect(YUNET.url).toMatch(/opencv_zoo\/raw\/[0-9a-f]{40}\//);
    expect(YUNET.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(YUNET.tamano).toBe(232_589);
  });

  it("sólo analiza video o imagen usados en una pista de video y sin foco", () => {
    const p = conClipHorizontal();
    expect(porAnalizar(p).map((a) => a.id).sort()).toEqual(["clip-01", "clip-02", "clip-03"]);
    const q = aplicarFocos(p, { "clip-02": CARA_DERECHA, "clip-03": null });
    expect(q.assets["clip-02"]!.foco).toMatchObject({ x: 0.7279, modelo: YUNET.id });
    expect(q.assets["clip-03"]!.foco).toBeUndefined();
    expect(porAnalizar(q).map((a) => a.id).sort()).toEqual(["clip-01", "clip-03"]);
    // El foco viaja por el esquema (geeper.json lo conserva al validar).
    expect(validarProyecto(JSON.parse(JSON.stringify(q))).assets["clip-02"]!.foco?.modelo).toBe(YUNET.id);
  });

  it("pone la cara en el centro del cuadro vertical y limita al borde del asset", () => {
    const a = asset({ foco: { ...CARA_DERECHA, modelo: YUNET.id } });
    // 1920×1080 cubriendo 1080×1920: escala 1,778, ancho escalado 3413, desborde 2333.
    // La cara (0,7279 × 3413 = 2484 px) debe quedar en 540: (2484 − 540) / 2333 = 83,3 %.
    expect(posicionCara(a, 1080, 1920)).toBe("object-position: 83.34% 50.00%;");
    const borde = asset({ foco: { ...CARA_DERECHA, x: 0.99, modelo: YUNET.id } });
    expect(posicionCara(borde, 1080, 1920)).toMatch(/^object-position: 100\.00% /);
    expect(posicionCara(asset({}), 1080, 1920)).toBeNull();
  });

  it("cubre sólo si la cara es estable, aparece seguido y entra en el recorte", () => {
    const f = { ...CARA_DERECHA, modelo: YUNET.id };
    expect(cubreConCara(asset({ foco: f }), 1080, 1920)).toBe(true);
    expect(cubreConCara(asset({ foco: { ...f, cobertura: 0.3 } }), 1080, 1920)).toBe(false);
    // Lo visible es 0,316 del ancho: una cara que se mueve más de un cuarto de eso se saldría.
    expect(cubreConCara(asset({ foco: { ...f, dispersion: 0.1 } }), 1080, 1920)).toBe(false);
    expect(cubreConCara(asset({ foco: { ...f, ancho: 0.25 } }), 1080, 1920)).toBe(false);
  });

  it("el compilador sigue la cara salvo que el clip fije ajuste o ancla", () => {
    const sin = compilar(conClipHorizontal(), plantilla, "/tmp/m.wav", "/tmp/p");
    // Sin foco, un 16:9 en 9:16 se contiene con fondo desenfocado (como siempre).
    expect(sin.html).toMatch(/id="v-e02-0" class="clip fondo contener"/);

    const p = aplicarFocos(conClipHorizontal(), { "clip-02": CARA_DERECHA });
    const con = compilar(p, plantilla, "/tmp/m.wav", "/tmp/p");
    expect(con.html).toMatch(/id="v-e02-0" class="clip fondo"[^>]*style="object-position: 83\.34% 50\.00%;"/);
    expect(con.html).not.toMatch(/id="b-e02-0"/);
    // Las escenas sin foco no cambian.
    expect(con.html.match(/id="v-e01-0"[^>]*>/)![0]).toBe(sin.html.match(/id="v-e01-0"[^>]*>/)![0]);

    const fijo = aplicarEdicion(p, { tipo: "ajusteVisual", escena: "e02", ancla: "arriba" });
    expect(sigueCara(pista(fijo, "visual").clips[1]!, fijo.assets["clip-02"]!)).toBe(false);
    expect(compilar(fijo, plantilla, "/tmp/m.wav", "/tmp/p").html).toMatch(/id="v-e02-0" class="clip fondo contener"/);

    const cubrir = aplicarEdicion(fijo, { tipo: "ajusteVisual", escena: "e02", ajuste: "cubrir", ancla: "arriba" });
    expect(compilar(cubrir, plantilla, "/tmp/m.wav", "/tmp/p").html).toMatch(/id="v-e02-0" class="clip fondo ancla-arriba"/);
  });
});

describe("selector «¿Qué se ve?» y análisis automático", () => {
  const f = { ...CARA_DERECHA, modelo: YUNET.id };

  it("el recuadro de la vista previa es el mismo recorte que compila", () => {
    const a = asset({ foco: f });
    // Siguiendo la cara: ancho visible 1080/3413 = 0,3164, empezando en 0,8334 × (1 − 0,3164).
    expect(visibleDe({}, a, 1080, 1920)).toEqual({ todo: false, x: 0.5697, y: 0, w: 0.3164, h: 1 });
    expect(visibleDe({ ajuste: "cubrir", ancla: "centro" }, a, 1080, 1920)).toMatchObject({ x: 0.3418, w: 0.3164 });
    expect(visibleDe({}, asset({}), 1080, 1920)).toEqual({ todo: true });
  });

  it("ofrece sólo opciones que cambian algo, en palabras simples", () => {
    const c = { id: "c", asset: "a", rango: { inicio: 0, duracion: 1 } };
    const con = encuadreDe(c, asset({ foco: f }), 1080, 1920);
    expect(con.opciones.map((o) => o.id)).toEqual(["auto", "cara", "centro", "todo"]); // arriba/abajo = centro en un 16:9 a 9:16
    expect(con).toMatchObject({ elegida: "auto", siguiendoCara: true, cara: { x: 0.7279, y: 0.2888 } });
    const sin = encuadreDe(c, asset({}), 1080, 1920);
    expect(sin.opciones.map((o) => o.id)).not.toContain("cara");
    // Un 9:16 en 16:9 recorta arriba y abajo: ahí sí aparecen.
    const vertical = encuadreDe({ ...c, ajuste: "cubrir", ancla: "arriba" }, asset({ ancho: 1080, alto: 1920 }), 1920, 1080);
    expect(vertical.opciones.map((o) => o.id)).toEqual(["auto", "centro", "arriba", "abajo", "todo"]);
    expect(vertical.elegida).toBe("arriba");
  });

  it("analiza una sola vez por proyecto, avisa qué escenas cambian y se puede dejar como estaba", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "geeper-caras-"));
    try {
      const p = conClipHorizontal();
      // Caché ya calculado (como si YuNet hubiera corrido): clip-02 con cara, los demás sin.
      const h = p.assets["clip-02"]!.hash;
      await fs.writeFile(path.join(dir, "caras.json"), JSON.stringify({ focos: { [h]: CARA_DERECHA } }));
      expect(await faltaAuto(dir)).toBe(true);
      const ctx = { dir, log: () => {} };
      const r = (await autoCaras(ctx, p, 1080, 1920))!;
      expect(r.escenas).toEqual(["e02"]);
      expect(r.p.assets["clip-02"]!.foco?.modelo).toBe(YUNET.id);
      // Una sola vez: abrirlo de nuevo (o restaurar una versión vieja) no lo vuelve a cambiar.
      expect(await faltaAuto(dir)).toBe(false);
      expect(await autoCaras(ctx, p, 1080, 1920)).toBeNull();
      // «Dejar como estaba» devuelve exactamente el recorte de antes.
      const como = sinSeguirCaras(r.p, r.escenas);
      expect(escenasQueCambian(p, como, 1080, 1920)).toEqual([]);
      expect(compilar(como, plantilla, "/tmp/m.wav", "/tmp/p").html).toMatch(/id="v-e02-0" class="clip fondo contener"/);
      // Y el selector marca lo que se ve («Todo»), no «Automático».
      const e02 = pista(como, "visual").clips.find((c) => c.escena === "e02")!;
      const sel = encuadreDe(e02, como.assets[e02.asset]!, 1080, 1920);
      expect(sel.elegida).not.toBe("auto");
      expect(sel.opciones.find((o) => o.id === sel.elegida)!.visible).toEqual(sel.actual);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
