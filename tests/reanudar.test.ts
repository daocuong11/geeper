import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

const HIJO = path.join(process.cwd(), "tests", "ayudas", "pasos-hijo.ts");
const TSX = path.join(process.cwd(), "node_modules", ".bin", "tsx");

function esperar(cond: () => boolean, ms = 20_000) {
  return new Promise<void>((ok, mal) => {
    const t0 = Date.now();
    const i = setInterval(() => {
      if (cond()) {
        clearInterval(i);
        ok();
      } else if (Date.now() - t0 > ms) {
        clearInterval(i);
        mal(new Error("tiempo agotado"));
      }
    }, 50);
  });
}

it("un trabajo matado (kill -9) a mitad se relanza sin repetir los pasos terminados", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geeper-reanudar-"));
  // 1.ª corrida: se mata con SIGKILL mientras corre el paso «dos».
  const hijo = spawn(TSX, [HIJO, dir, "60000"], { stdio: "ignore" });
  await esperar(() => fs.existsSync(path.join(dir, "en-dos")));
  hijo.kill("SIGKILL");
  await new Promise((r) => hijo.on("close", r));
  expect(fs.readFileSync(path.join(dir, "corridas.txt"), "utf8").trim().split("\n")).toEqual(["uno", "dos"]);
  // El paso cortado no dejó su salida con el nombre final ni manifiesto.
  expect(fs.existsSync(path.join(dir, "salidas", "dos.txt"))).toBe(false);
  expect(fs.readdirSync(path.join(dir, "manifiestos")).filter((f) => f.startsWith("dos-"))).toEqual([]);

  // 2.ª corrida: «uno» se salta; «dos» y «tres» corren.
  const otra = spawn(TSX, [HIJO, dir, "0"], { stdio: "ignore" });
  await new Promise((r) => otra.on("close", r));
  expect(fs.existsSync(path.join(dir, "fin"))).toBe(true);
  expect(fs.readFileSync(path.join(dir, "corridas.txt"), "utf8").trim().split("\n")).toEqual(["uno", "dos", "dos", "tres"]);
  expect(fs.readFileSync(path.join(dir, "salidas", "dos.txt"), "utf8")).toBe("parcial dos completo");

  // 3.ª corrida: todo se salta.
  const tercera = spawn(TSX, [HIJO, dir, "0"], { stdio: "ignore" });
  await new Promise((r) => tercera.on("close", r));
  expect(fs.readFileSync(path.join(dir, "corridas.txt"), "utf8").trim().split("\n")).toHaveLength(4);

  // Si alguien cambia una salida a mano, el paso se rehace.
  fs.writeFileSync(path.join(dir, "salidas", "tres.txt"), "tocado");
  const cuarta = spawn(TSX, [HIJO, dir, "0"], { stdio: "ignore" });
  await new Promise((r) => cuarta.on("close", r));
  expect(fs.readFileSync(path.join(dir, "corridas.txt"), "utf8").trim().split("\n").slice(-1)).toEqual(["tres"]);
});

it("un paso ya hecho con otra ruta de salida no se repite: deja el mismo resultado en la ruta nueva", async () => {
  const { paso } = await import("@/lib/pasos");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geeper-paso-"));
  const ctx = { dir, log: () => {} };
  let corridas = 0;
  const hacer = (salida: string) =>
    paso(ctx, "entrega.prueba", { archivos: [], params: { x: 1 }, motor: "m" }, [path.join(dir, salida)], async ([tmp]) => {
      corridas++;
      fs.writeFileSync(tmp!, "contenido");
      return { ok: true };
    });
  await hacer("renders/v1.mp4");
  const r = await hacer("renders/v2.mp4"); // misma entrada, otra versión
  expect(r.saltado).toBe(true);
  expect(corridas).toBe(1);
  expect(fs.readFileSync(path.join(dir, "renders", "v2.mp4"), "utf8")).toBe("contenido");
  fs.rmSync(dir, { recursive: true, force: true });
});
