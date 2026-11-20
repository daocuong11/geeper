import { describe, expect, it } from "vitest";
import { archivoCraft, cliCraft, exe, pythonDeVenv, SISTEMA } from "@/lib/plataforma";

describe("plataforma", () => {
  it("en Linux (donde corren las pruebas) las rutas son las de siempre", () => {
    expect(SISTEMA).toBe("linux");
    expect(exe("ffmpeg")).toBe("ffmpeg");
    expect(pythonDeVenv("/v")).toBe("/v/bin/python");
    expect(cliCraft("/h/photocraft", "photocraft-cli")).toBe("/h/photocraft/actual/bin/photocraft-cli");
    expect(archivoCraft("photocraft", "0.23.1")).toEqual({ archivo: "photocraft-0.23.1-linux-x86_64.tar.gz", raiz: "photocraft-0.23.1-linux-x86_64", extraer: "tar" });
  });
});
