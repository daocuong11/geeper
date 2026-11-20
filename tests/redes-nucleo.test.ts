import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ErrorArchivoPrivado, leerPrivado, protegerPrivado, revisarPrivado } from "@/lib/redes/archivo-privado";
import { privadosBloquean, protegerPrivados, revisarPrivados } from "@/lib/redes/privados";
import { cifrar, descifrar, ErrorClave } from "@/lib/redes/cifrado";
import { leerConfig } from "@/lib/redes/config";
import { abrir, challenge, nuevoEstado, sellar } from "@/lib/redes/oauth";
import { juzgar } from "@/lib/redes/salida";
import { registrarSecreto, tapar } from "@/lib/redes/secretos";

process.env.GEEPER_CONFIG = fs.mkdtempSync(path.join(os.tmpdir(), "geeper-config-"));

describe("cifrado de tokens", () => {
  it("ida y vuelta, y un nonce distinto cada vez", () => {
    const clave = randomBytes(32);
    const a = cifrar("token-secreto", clave);
    const b = cifrar("token-secreto", clave);
    expect(a).not.toBe(b);
    expect(descifrar(a, clave)).toBe("token-secreto");
  });

  it("falla con otra clave o si se altera", () => {
    const a = cifrar("token-secreto", randomBytes(32));
    expect(() => descifrar(a, randomBytes(32))).toThrow(ErrorClave);
    const clave = randomBytes(32);
    const c = cifrar("x", clave);
    // Se altera un byte real del texto cifrado: cambiar un carácter del base64 junto al «=» puede
    // tocar sólo bits de relleno (o ninguno) y el test fallaba al azar.
    const [v, datos] = c.split(":");
    const b = Buffer.from(datos!, "base64");
    b[b.length - 1]! ^= 0x01;
    const roto = `${v}:${b.toString("base64")}`;
    expect(() => descifrar(roto, clave)).toThrow(ErrorClave);
  });

  it("crea la clave con permisos 600 la primera vez", () => {
    const c = cifrar("hola");
    expect(descifrar(c)).toBe("hola");
    const st = fs.statSync(path.join(process.env.GEEPER_CONFIG!, "clave"));
    expect(st.size).toBe(32);
    expect((st.mode & 0o777).toString(8)).toBe("600");
  });
});

describe("archivos secretos (clave, redes.json)", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "geeper-privado-"));

  it("lee un archivo 600 propio y deja pasar el ENOENT", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "ok"), "secreto", { mode: 0o600 });
    expect(leerPrivado(path.join(d, "ok")).toString()).toBe("secreto");
    expect(() => leerPrivado(path.join(d, "no-hay"))).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("rechaza permisos abiertos, enlaces simbólicos y directorios", () => {
    const d = tmp();
    const abierto = path.join(d, "abierto");
    fs.writeFileSync(abierto, "x", { mode: 0o644 });
    fs.chmodSync(abierto, 0o644);
    expect(() => leerPrivado(abierto)).toThrow(/permisos 644/);
    const real = path.join(d, "real");
    fs.writeFileSync(real, "x", { mode: 0o600 });
    fs.symlinkSync(real, path.join(d, "enlace"));
    expect(() => leerPrivado(path.join(d, "enlace"))).toThrow(ErrorArchivoPrivado);
    expect(() => leerPrivado(d)).toThrow(ErrorArchivoPrivado);
  });

  it("revisa sin leer y protege sólo archivos normales propios", () => {
    const d = tmp();
    const abierto = path.join(d, "abierto");
    fs.writeFileSync(abierto, "x");
    fs.chmodSync(abierto, 0o644);
    expect(revisarPrivado(abierto)).toEqual({ estado: "abierto", modo: "644" });
    expect(protegerPrivado(abierto)).toBe("ok");
    expect((fs.statSync(abierto).mode & 0o777).toString(8)).toBe("600");
    expect(revisarPrivado(path.join(d, "no-hay")).estado).toBe("falta");
    // Un enlace no se toca: ni él ni el archivo al que apunta.
    const real = path.join(d, "real");
    fs.writeFileSync(real, "x");
    fs.chmodSync(real, 0o644);
    fs.symlinkSync(real, path.join(d, "enlace"));
    expect(protegerPrivado(path.join(d, "enlace"))).toBe("enlace");
    expect((fs.statSync(real).mode & 0o777).toString(8)).toBe("644");
  });

  it("explica los archivos de Geeper y los protege con el botón", () => {
    const antes = process.env.GEEPER_CONFIG;
    const d = tmp();
    process.env.GEEPER_CONFIG = d;
    try {
      expect(revisarPrivados().every((a) => a.estado === "falta" && !a.problema)).toBe(true);
      fs.writeFileSync(path.join(d, "redes.json"), "{}");
      fs.chmodSync(path.join(d, "redes.json"), 0o664);
      expect(privadosBloquean()).toBe(true);
      const redes = revisarPrivados().find((a) => a.id === "redes")!;
      expect(redes).toMatchObject({ problema: true, arreglable: true });
      expect(redes.mensaje).not.toMatch(/chmod/); // lenguaje simple; el comando va en el detalle
      expect(protegerPrivados().some((a) => a.problema)).toBe(false);
      expect(leerConfig()).toEqual({});
    } finally {
      process.env.GEEPER_CONFIG = antes;
    }
  });

  it("no reemplaza una clave con permisos inseguros: falla", () => {
    const antes = process.env.GEEPER_CONFIG;
    const d = tmp();
    process.env.GEEPER_CONFIG = d;
    try {
      fs.writeFileSync(path.join(d, "clave"), randomBytes(32), { mode: 0o600 });
      fs.chmodSync(path.join(d, "clave"), 0o640);
      expect(() => cifrar("x")).toThrow(/chmod 600/);
      fs.writeFileSync(path.join(d, "redes.json"), "{}", { mode: 0o666 });
      fs.chmodSync(path.join(d, "redes.json"), 0o666);
      expect(() => leerConfig()).toThrow(ErrorArchivoPrivado);
    } finally {
      process.env.GEEPER_CONFIG = antes;
    }
  });
});

describe("OAuth: PKCE y state", () => {
  const clave = randomBytes(32);

  it("challenge S256 en base64url (RFC 7636, ejemplo del apéndice B) y en hex", () => {
    expect(challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(challenge("abc", "S256-hex")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("acepta la cookie propia con el mismo state", () => {
    const e = nuevoEstado("youtube");
    expect(abrir(sellar(e, clave), "youtube", e.state, clave).verifier).toBe(e.verifier);
  });

  it("rechaza state ajeno, otra red, firma alterada o vencida", () => {
    const e = nuevoEstado("youtube");
    const cookie = sellar(e, clave);
    expect(() => abrir(cookie, "youtube", "otro", clave)).toThrow(/state/);
    expect(() => abrir(cookie, "tiktok", e.state, clave)).toThrow(/otra red/);
    expect(() => abrir(cookie, "youtube", e.state, randomBytes(32))).toThrow(/firma/);
    expect(() => abrir(cookie, "youtube", e.state, clave, Date.now() + 11 * 60_000)).toThrow(/10 minutos/);
    expect(() => abrir(undefined, "youtube", e.state, clave)).toThrow(/cookie/);
  });
});

describe("filtro de secretos", () => {
  it("tapa parámetros, cabeceras, URLs de subida y valores registrados", () => {
    registrarSecreto("ya29.valor-registrado-123");
    const t = tapar([
      "access_token=abc123456789&x=1",
      '{"refresh_token":"1//def456789"}',
      "Authorization: Bearer ya29.otroToken123456",
      "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=XYZ",
      "https://rupload.facebook.com/ig-api-upload/v23.0/123",
      "?code=4/0Abc&state=s",
      "token suelto ya29.valor-registrado-123",
    ].join("\n"));
    for (const s of ["abc123456789", "1//def456789", "ya29.otroToken123456", "upload_id=XYZ", "rupload", "4/0Abc", "valor-registrado"]) expect(t).not.toContain(s);
    expect(t).toContain("x=1");
  });
});

describe("veredicto del VPN", () => {
  const salida = { ip: "203.0.113.7", pais: "AR", fuente: "x", medido: new Date().toISOString() };
  it("apagado siempre deja pasar", () => {
    expect(juzgar({ vpn: "apagado", ipEsperada: "", paisEsperado: "" }, null).ok).toBe(true);
  });
  it("requerido: compara IP y país", () => {
    expect(juzgar({ vpn: "requerido", ipEsperada: "203.0.113.7", paisEsperado: "AR" }, salida).estado).toBe("activo");
    expect(juzgar({ vpn: "requerido", ipEsperada: "", paisEsperado: "US" }, salida).estado).toBe("caido");
    expect(juzgar({ vpn: "requerido", ipEsperada: "", paisEsperado: "" }, salida).estado).toBe("sin_configurar");
    expect(juzgar({ vpn: "requerido", ipEsperada: "", paisEsperado: "AR" }, { ...salida, ip: null }).estado).toBe("sin_dato");
  });
});
