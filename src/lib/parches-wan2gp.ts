/**
 * Arreglos mínimos a Wan2GP (commit fijado en instalar-wan2gp.ts), aplicados al instalarlo y antes de
 * cada tarea (si ya están, no hace nada). Cada uno reemplaza un texto exacto: si Wan2GP cambió y el
 * texto ya no está, no se toca nada y se avisa en el registro.
 */
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export interface Parche {
  id: string;
  archivo: string;
  antes: string;
  despues: string;
  porque: string;
}

export const PARCHES: Parche[] = [
  {
    id: "infinitetalk-indices-cpu",
    archivo: "models/wan/multitalk/multitalk.py",
    antes: "        return table[indices - first * self.BLOCK_FRAMES]\n",
    despues: "        return table[(indices - first * self.BLOCK_FRAMES).to(table.device)]  # geeper: indices-cpu\n",
    // Medido 2026-11-21: con el dispositivo por defecto en CUDA (mmgp), torch.arange crea los índices en
    // la GPU y la tabla de audio está en la CPU → «indices should be either on cpu or on the same device».
    porque: "InfiniteTalk (avatar que habla) fallaba al leer el audio con los índices en la GPU.",
  },
];

/** Aplica los parches que falten (función con E/S mínima, idempotente). */
export async function aplicarParchesWan2gp(dir: string, log?: (l: string) => void): Promise<string[]> {
  const aplicados: string[] = [];
  for (const p of PARCHES) {
    const ruta = path.join(dir, p.archivo);
    if (!existsSync(ruta)) continue;
    const texto = await fs.readFile(ruta, "utf8");
    if (texto.includes(p.despues)) continue;
    if (!texto.includes(p.antes)) {
      log?.(`Parche ${p.id}: Wan2GP cambió y ya no hace falta o no se puede aplicar; no se tocó.`);
      continue;
    }
    await fs.writeFile(ruta, texto.replace(p.antes, p.despues));
    log?.(`Parche ${p.id} aplicado: ${p.porque}`);
    aplicados.push(p.id);
  }
  return aplicados;
}
