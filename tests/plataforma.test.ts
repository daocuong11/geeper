import path from "node:path";
import { describe, expect, it } from "vitest";
import { archivoCraft, cliCraft, exe, pythonDeVenv, SISTEMA } from "@/lib/plataforma";

// Corre en Linux (desarrollo) y en las máquinas de CI de Windows y macOS que arman los instaladores.
describe("plataforma", () => {
  it("cada sistema usa sus nombres, venvs y archivos de Craft", () => {
    const esperado = { win32: "windows", darwin: "mac" }[process.platform as string] ?? "linux";
    expect(SISTEMA).toBe(esperado);
    const v = path.join("v");
    if (SISTEMA === "windows") {
      expect(exe("ffmpeg")).toBe("ffmpeg.exe");
      expect(exe("uv.exe")).toBe("uv.exe");
      expect(pythonDeVenv(v)).toBe(path.join(v, "Scripts", "python.exe"));
      expect(cliCraft(path.join("h", "photocraft"), "photocraft-cli")).toBe(path.join("h", "photocraft", "actual", "photocraft-cli.exe"));
      expect(archivoCraft("photocraft", "0.23.1")).toEqual({ archivo: "photocraft-0.23.1-windows-x64-portable.zip", raiz: "", extraer: "zip" });
    } else if (SISTEMA === "mac") {
      expect(exe("ffmpeg")).toBe("ffmpeg");
      expect(pythonDeVenv(v)).toBe(path.join(v, "bin", "python"));
      expect(cliCraft("/h/photocraft", "photocraft-cli")).toBe("/h/photocraft/actual/photocraft-cli");
      expect(archivoCraft("photocraft", "0.23.1")).toEqual({ archivo: "photocraft-cli-0.23.1-macos-universal.zip", raiz: "photocraft-cli-0.23.1-macos-universal", extraer: "zip" });
    } else {
      expect(exe("ffmpeg")).toBe("ffmpeg");
      expect(pythonDeVenv("/v")).toBe("/v/bin/python");
      expect(cliCraft("/h/photocraft", "photocraft-cli")).toBe("/h/photocraft/actual/bin/photocraft-cli");
      expect(archivoCraft("photocraft", "0.23.1")).toEqual({ archivo: "photocraft-0.23.1-linux-x86_64.tar.gz", raiz: "photocraft-0.23.1-linux-x86_64", extraer: "tar" });
    }
  });
});
