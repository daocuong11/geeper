import { describe, expect, it } from "vitest";
import { DatosCampana } from "@/lib/anuncios/esquema";
import { leerTabla, MAX_FILAS, problemasDeFila, variableDePrueba } from "@/lib/anuncios/tabla";
import { conCambios } from "@/lib/anuncios/variantes";
import { compilar } from "@/lib/compilador";
import { escenasEnLinea } from "@/lib/linea";
import { PLANTILLAS_INICIALES } from "@/lib/plantillas";
import { proyectoDePrueba } from "./fixtures";

describe("leer lo pegado desde Excel o un CSV", () => {
  it("sin encabezados, toma gancho, texto y botón en orden (tabuladores de Excel)", () => {
    const r = leerTabla("¿Sabías esto?\t50 % OFF\tCompra hoy\nOtro gancho\t\t\n");
    expect(r.filas).toEqual([
      { gancho: "¿Sabías esto?", texto: "50 % OFF", cta: "Compra hoy" },
      { gancho: "Otro gancho", texto: "", cta: "" },
    ]);
  });
  it("con encabezados en cualquier orden, comillas y punto y coma", () => {
    const r = leerTabla('Botón;Texto en pantalla;Gancho;Notas\n"Compra; ya";"Dice ""hola""";Mira esto;x\n');
    expect(r.filas).toEqual([{ gancho: "Mira esto", texto: 'Dice "hola"', cta: "Compra; ya" }]);
    expect(r.avisos).toEqual(["Columnas que no se usan: Notas"]);
  });
  it("una celda con salto de línea entre comillas y BOM de Excel", () => {
    const r = leerTabla('﻿gancho,cta\n"línea uno\nlínea dos",Ven\n');
    expect(r.filas).toEqual([{ gancho: "línea uno línea dos", texto: "", cta: "Ven" }]);
  });
  it(`corta en ${MAX_FILAS} filas y avisa`, () => {
    const r = leerTabla(Array.from({ length: 14 }, (_, i) => `gancho número ${i}`).join("\n"));
    expect(r.filas).toHaveLength(MAX_FILAS);
    expect(r.avisos[0]).toMatch(/primeras 10/);
  });
});

describe("validar filas", () => {
  const f = (x: Partial<{ gancho: string; texto: string; cta: string; imagen: string }>) => ({ gancho: "", texto: "", cta: "", imagen: "", ...x });
  it("explica qué está mal", () => {
    expect(problemasDeFila(f({}))).toEqual(["No cambia nada"]);
    expect(problemasDeFila(f({ gancho: "ok" }))).toEqual(["El gancho es muy corto"]);
    expect(problemasDeFila(f({ imagen: "anuncios/x/img.png" }))).toEqual([]);
  });
  it("elige la variable de la prueba", () => {
    expect(variableDePrueba([f({ gancho: "uno" }), f({ gancho: "dos" })])).toBe("gancho");
    expect(variableDePrueba([f({ cta: "Ven" })])).toBe("cta");
    expect(variableDePrueba([f({ gancho: "uno", texto: "x" })])).toBe("otra");
  });
  it("la campaña guarda las tablas y las viejas siguen siendo válidas", () => {
    expect(DatosCampana.parse({}).tablas).toEqual({});
    const d = DatosCampana.parse({ tablas: { "c-1": [{ id: "f-1", gancho: "Hola mundo" }] } });
    expect(d.tablas["c-1"]![0]).toMatchObject({ gancho: "Hola mundo", texto: "", concepto: null });
  });
});

describe("aplicar una fila al proyecto", () => {
  it("texto en pantalla al inicio y botón final propio, sin tocar lo que se dice", () => {
    const original = proyectoDePrueba();
    const { p, escenaVoz } = conCambios(original, { texto: "50 % OFF hoy", cta: "Compra ya" }, "v-1", "Variante 1");
    expect(escenaVoz).toBeNull();
    expect(p.id).toBe("v-1");
    expect(p.cta).toBe("Compra ya");
    expect(p.textos.at(-1)).toMatchObject({ texto: "50 % OFF hoy", inicio: 0.2, estilo: "titulo", posicion: "arriba" });
    expect(p.escenas).toEqual(original.escenas);
    expect(original.cta).toBeUndefined();
    // El compilador usa el botón del proyecto en vez del de la plantilla.
    const html = compilar(p, PLANTILLAS_INICIALES[0]!.datos, "/tmp/m.wav", "/tmp/x").html;
    expect(html).toContain('<div class="cta">Compra ya</div>');
  });
  it("el gancho cambia la primera escena y pide su voz nueva", () => {
    const original = proyectoDePrueba();
    const { p, escenaVoz } = conCambios(original, { gancho: "Nadie te contó esto" }, "v-2", "Variante 2");
    expect(escenaVoz).toBe(escenasEnLinea(original)[0]!.escena.id);
    expect(p.escenas[escenaVoz!]!.texto).toBe("Nadie te contó esto");
  });
  it("una fila sin cambios no crea nada", () => {
    expect(() => conCambios(proyectoDePrueba(), { gancho: "  ", cta: "" }, "x", "y")).toThrow(/no cambia nada/);
  });
});

import os from "node:os";
import path from "node:path";
import { imagenDeCampana } from "@/lib/anuncios/rutas-campana";
import { aCsv } from "@/lib/anuncios/exportar";
import { resolverReferencias } from "@/lib/encadenar";

describe("arreglos de la revisión", () => {
  it("la imagen de una fila no sale de la carpeta de su campaña", () => {
    process.env.GEEPER_DATA = path.join(os.tmpdir(), "geeper-datos-prueba");
    expect(imagenDeCampana("c1", "anuncios/c1/img-abc.png")).toBe(path.join(os.tmpdir(), "geeper-datos-prueba", "anuncios", "c1", "img-abc.png"));
    expect(() => imagenDeCampana("c1", "anuncios/c1/../c2/img.png")).toThrow(/fuera/);
    expect(() => imagenDeCampana("c1", "anuncios/c1/../../geeper.db")).toThrow(/fuera/);
    expect(() => imagenDeCampana("c1", "/etc/passwd")).toThrow(/fuera/);
    delete process.env.GEEPER_DATA;
  });
  it("con encabezados repetidos vale la primera columna", () => {
    expect(leerTabla("Gancho,gancho\nuno,dos\n").filas).toEqual([{ gancho: "uno", texto: "", cta: "" }]);
  });
  it("una referencia no lee claves heredadas", () => {
    expect(() => resolverReferencias("$1.__proto__", [{ id: "a", textos: [], clips: [], escenas: [] }], 2)).toThrow(/no creó/);
    expect(() => resolverReferencias("$1.constructor", [{ id: "a", textos: [], clips: [], escenas: [] }], 2)).toThrow(/no creó/);
  });
  it("el CSV exportado neutraliza fórmulas", () => {
    const csv = aCsv({ conceptos: [{ nombre: "=HYPERLINK(1)", copy: [{ nombre: "Gancho", estado: "pass", evidencia: "+1 por ciento" }], video: [], ubicaciones: [] }] } as unknown as Parameters<typeof aCsv>[0]);
    expect(csv.split("\n")[1]).toBe("'=HYPERLINK(1),copy,Gancho,pass,'+1 por ciento,,,");
  });
});
