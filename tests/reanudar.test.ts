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
