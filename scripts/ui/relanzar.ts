/** Relanza desde la página Trabajos el primer trabajo «interrumpido» (como lo haría una persona). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

async function main() {
  const raiz = path.join(os.homedir(), ".cache", "hyperframes", "chrome", "chrome-headless-shell");
  const v = fs.readdirSync(raiz).sort().pop()!;
  const b = await chromium.launch({ executablePath: path.join(raiz, v, "chrome-headless-shell-linux64", "chrome-headless-shell") });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(`${process.env.GEEPER_URL ?? "http://localhost:3300"}/trabajos`, { waitUntil: "domcontentloaded" });
  await p.getByText("interrumpido").first().waitFor({ timeout: 20_000 });
  const fila = p.locator("li", { hasText: "interrumpido" }).first();
  console.log((await fila.innerText()).split("\n").slice(0, 3).join(" | "));
  await fila.getByRole("button", { name: "Relanzar" }).click();
  await p.waitForTimeout(2500);
  await b.close();
}
void main();
