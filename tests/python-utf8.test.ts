import { describe, expect, it } from "vitest";
import { argsPython, correr, esPython } from "@/lib/proceso";

describe("Python siempre en UTF-8", () => {
  it("reconoce los intérpretes de Python en cualquier sistema", () => {
    for (const c of ["python", "python3", "python3.12", "/h/venvs/voz/bin/python", "C:\\Geeper\\venvs\\voz\\Scripts\\python.exe"]) expect(esPython(c)).toBe(true);
    for (const c of ["uv", "ffmpeg", "/usr/bin/pythonista", "python-config"]) expect(esPython(c)).toBe(false);
  });

  it("agrega -X utf8 (vale aunque vaya -I) y no lo repite", () => {
    expect(argsPython("python3", ["-I", "x.py"])).toEqual(["-X", "utf8", "-I", "x.py"]);
    expect(argsPython("python3", ["-X", "utf8", "x.py"])).toEqual(["-X", "utf8", "x.py"]);
    expect(argsPython("uv", ["venv"])).toEqual(["venv"]);
  });

  it("con -I, Python escribe las tildes en UTF-8", async () => {
    const r = await correr(process.platform === "win32" ? "python" : "python3", ["-I", "-c", "import sys; print(sys.flags.utf8_mode, '¡Hola, cámara!')"]);
    expect(r.stdout.trim()).toBe("1 ¡Hola, cámara!");
  });
});
