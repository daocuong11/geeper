/** Proceso hijo para la prueba de reanudación: 3 pasos; el 2.º tarda (ahí se le mata). */
import fs from "node:fs";
import path from "node:path";
import { paso } from "../../src/lib/pasos";

async function main() {
  const dir = process.argv[2]!;
  const lento = Number(process.argv[3] ?? 0);
  const marcar = (n: string) => fs.appendFileSync(path.join(dir, "corridas.txt"), `${n}\n`);
  const ctx = { dir, log: () => undefined };
  for (const [i, nombre] of ["uno", "dos", "tres"].entries()) {
    await paso(ctx, nombre, { archivos: [], params: { i }, motor: "prueba-v1" }, [path.join(dir, "salidas", `${nombre}.txt`)], async ([tmp]) => {
      marcar(nombre);
      fs.writeFileSync(tmp!, `parcial ${nombre}`);
      if (nombre === "dos" && lento) {
        fs.writeFileSync(path.join(dir, "en-dos"), "");
        await new Promise((r) => setTimeout(r, lento));
      }
      fs.appendFileSync(tmp!, " completo");
      return { nombre };
    });
  }
  fs.writeFileSync(path.join(dir, "fin"), "");
}
void main();
