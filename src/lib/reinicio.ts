/** ¿Se reinició Windows desde el último latido del worker? (eventos Kernel-Power 41 y arranque de WSL) */
import fs from "node:fs/promises";
import os from "node:os";
import { correr } from "./proceso";

export interface Reinicio {
  hubo: boolean;
  motivo: string;
  eventos: string[];
}

export async function eventosKernelPower41(): Promise<string[] | null> {
  try {
    const r = await correr(
      "powershell.exe",
      [
        "-NoProfile", "-NonInteractive", "-Command",
        "Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=41} -MaxEvents 20 -ErrorAction SilentlyContinue | ForEach-Object { $_.TimeCreated.ToUniversalTime().ToString('o') }",
      ],
      { timeout: 30_000, permitirFallo: true },
    );
    return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return null; // sin PowerShell (no es WSL): se usa sólo el arranque de WSL
  }
}

/** Arranque de la máquina: en Linux/WSL, de /proc/stat; en Windows y macOS, de cuánto lleva encendida. */
export async function arranqueWsl(): Promise<Date> {
  if (process.platform !== "linux") return new Date(Date.now() - os.uptime() * 1000);
  const stat = await fs.readFile("/proc/stat", "utf8");
  const btime = Number(/btime (\d+)/.exec(stat)?.[1] ?? 0);
  return new Date(btime * 1000);
}

export async function detectarReinicio(ultimoLatido: Date | null): Promise<Reinicio> {
  if (!ultimoLatido) return { hubo: false, motivo: "primera corrida", eventos: [] };
  const eventos = ((await eventosKernelPower41()) ?? []).filter((t) => new Date(t) > ultimoLatido);
  if (eventos.length) {
    return { hubo: true, motivo: `Windows se reinició sin aviso (Kernel-Power 41: ${eventos.join(", ")})`, eventos };
  }
  const arranque = await arranqueWsl();
  if (arranque > ultimoLatido) {
    return { hubo: true, motivo: `La máquina (WSL) arrancó a las ${arranque.toISOString()}, después del último latido`, eventos };
  }
  return { hubo: false, motivo: "sin reinicio", eventos };
}
