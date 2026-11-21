import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { esVueltaOAuth } from "../escritorio/oauth";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apps-redes-"));
process.env.GEEPER_CONFIG = dir;
const { abrirArchivo, borrarApp, exportarApps, guardarApp, importarApps, resumenApps } = await import("@/lib/redes/credenciales");
const { leerConfig } = await import("@/lib/redes/config");
const { proxy } = await import("../src/proxy");

const SECRETO = "GOCSPX-secreto-de-prueba-123";

describe("apps de las redes desde la UI", () => {
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("guarda una red sin tocar las demás y nunca devuelve el secreto", () => {
    guardarApp("youtube", { clientId: "  123-abc.apps.googleusercontent.com ", clientSecret: SECRETO });
    guardarApp("tiktok", { clientKey: "aw123", clientSecret: "tt-secreto-largo", publicacionDirecta: true });
    expect(leerConfig().youtube?.clientId).toBe("123-abc.apps.googleusercontent.com");
    const r = resumenApps();
    expect(JSON.stringify(r)).not.toContain(SECRETO);
    expect(r.find((a) => a.red === "youtube")).toMatchObject({ configurada: true, id: "…nt.com" });
    expect(r.find((a) => a.red === "tiktok")?.opciones).toEqual({ publicacionDirecta: true });
    expect(r.find((a) => a.red === "facebook")?.configurada).toBe(false);
    if (process.platform !== "win32") expect(fs.statSync(path.join(dir, "redes.json")).mode & 0o777).toBe(0o600);
  });

  it("rechaza datos incompletos con el nombre del campo", () => {
    expect(() => guardarApp("facebook", { appId: "1" })).toThrow(/Clave secreta de la app/);
  });

  it("exporta cifrado e importa con la contraseña; con otra o alterado, no", () => {
    const archivo = exportarApps("contraseña-del-equipo");
    expect(archivo).not.toContain(SECRETO);
    expect(() => exportarApps("corta")).toThrow(/10 caracteres/);
    expect(() => abrirArchivo(archivo, "otra-contraseña-mala")).toThrow(/contraseña no es la correcta/);
    const j = JSON.parse(archivo) as { datos: string };
    const alterado = JSON.stringify({ ...JSON.parse(archivo), datos: Buffer.from("x".repeat(40)).toString("base64") });
    expect(() => abrirArchivo(alterado, "contraseña-del-equipo")).toThrow(/contraseña no es la correcta|dañado/);
    expect(j.datos.length).toBeGreaterThan(10);
    const caro = JSON.stringify({ ...JSON.parse(archivo), kdf: { n: 2 ** 22, r: 8, p: 1, sal: "AAAA" } });
    expect(() => abrirArchivo(caro, "contraseña-del-equipo")).toThrow(/fuera de lo normal/);

    borrarApp("youtube");
    expect(leerConfig().youtube).toBeUndefined();
    expect(importarApps(archivo, "contraseña-del-equipo")).toEqual(["youtube", "tiktok"]);
    expect(leerConfig().youtube?.clientSecret).toBe(SECRETO);
  });
});

describe("pedidos de otros sitios (CSRF)", () => {
  const pedido = (metodo: string, cabeceras: Record<string, string>) =>
    proxy(new NextRequest("http://127.0.0.1:3300/api/cuentas/credenciales", { method: metodo, headers: { host: "127.0.0.1:3300", ...cabeceras } }));

  it("rechaza un POST que viene de otra página", () => {
    expect(pedido("PUT", { origin: "https://malo.example", "sec-fetch-site": "cross-site" }).status).toBe(403);
    expect(pedido("POST", { origin: "http://localhost:5173", "sec-fetch-site": "same-site" }).status).toBe(403);
  });

  it("deja pasar a Geeper, a la terminal y a las lecturas", () => {
    expect(pedido("PUT", { origin: "http://127.0.0.1:3300", "sec-fetch-site": "same-origin" }).status).toBe(200);
    expect(pedido("POST", { origin: "http://localhost:3300" }).status).toBe(200);
    expect(pedido("POST", {}).status).toBe(200);
    expect(pedido("GET", { origin: "https://malo.example", "sec-fetch-site": "cross-site" }).status).toBe(200);
  });
});

describe("vuelta del inicio de sesión en la app de escritorio", () => {
  it("reconoce el redirect URI registrado aunque Geeper corra en otro puerto", () => {
    expect(esVueltaOAuth("http://localhost:3300/api/cuentas/callback/youtube?code=x&state=y")).toBe(true);
    expect(esVueltaOAuth("http://127.0.0.1:51234/api/cuentas/callback/tiktok?code=x")).toBe(true);
    expect(esVueltaOAuth("https://accounts.google.com/o/oauth2/auth")).toBe(false);
    expect(esVueltaOAuth("http://malo.example/api/cuentas/callback/youtube")).toBe(false);
  });
});
