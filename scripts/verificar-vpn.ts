/**
 * pnpm tsx scripts/verificar-vpn.ts [PAIS] — comprueba que TODO el equipo sale por el VPN (docs/VPN.md).
 *
 * Revisa, desde Windows y desde WSL: IP y país de salida, fuga por IPv6, servidores DNS de Windows,
 * kill-switch (si existe el túnel) y que la zona horaria, la región y el idioma de Windows coincidan
 * con el país. PAIS es el código ISO de 2 letras (US, ES, MX…). Si no se da, usa el de Sistema → Red.
 * Solo lee: no cambia nada. Sale con 1 si hay algún problema.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "../src/lib/db";
import { leerAjustes, medirSalida } from "../src/lib/redes/salida";

const ejecutar = promisify(execFile);

type Nivel = "ok" | "aviso" | "mal";
const filas: { nivel: Nivel; nombre: string; detalle: string; arreglo?: string }[] = [];
const anotar = (nivel: Nivel, nombre: string, detalle: string, arreglo?: string) => filas.push({ nivel, nombre, detalle, arreglo });

async function powershell(script: string): Promise<string | null> {
  try {
    const { stdout } = await ejecutar("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 30_000 });
    return stdout.replace(/\r/g, "").trim();
  } catch {
    return null;
  }
}

async function ipv6Wsl(): Promise<string | null> {
  try {
    const r = await fetch("https://api64.ipify.org?format=json", { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { ip?: string };
    return j.ip && j.ip.includes(":") ? j.ip : null;
  } catch {
    return null;
  }
}

async function main() {
  const arg = process.argv[2]?.trim().toUpperCase();
  const ajustes = await leerAjustes().catch(() => null);
  const pais = arg || ajustes?.paisEsperado || "";
  if (!/^[A-Z]{2}$/.test(pais)) {
    console.error("Indica el país esperado: pnpm tsx scripts/verificar-vpn.ts US  (o configúralo en Sistema → Red).");
    process.exit(2);
  }
  console.log(`País esperado: ${pais}\n`);

  // 1. Salida desde WSL (lo que ven Geeper y el worker).
  const wsl = await medirSalida();
  if (!wsl.pais) anotar("mal", "Salida desde WSL", "ningún servicio de IP respondió", "¿Hay internet? Si el kill-switch está activo y el túnel caído, es lo esperado.");
  else if (wsl.pais === pais) anotar("ok", "Salida desde WSL", `${wsl.pais} · ${wsl.ip}`);
  else anotar("mal", "Salida desde WSL", `${wsl.pais} · ${wsl.ip} (se esperaba ${pais})`, "Activa el túnel en WireGuard (Windows). WSL sale por Windows, así que basta con eso.");

  // 2. Salida desde Windows (navegador y resto de programas).
  const win = await powershell("$r = Invoke-RestMethod -TimeoutSec 8 https://api.country.is/; \"$($r.country) $($r.ip)\"");
  if (win === null) anotar("aviso", "Salida desde Windows", "no se pudo consultar (¿powershell.exe accesible desde WSL?)");
  else {
    const [p, ip] = win.split(" ");
    if (p === pais) anotar("ok", "Salida desde Windows", `${p} · ${ip}`);
    else anotar("mal", "Salida desde Windows", `${p} · ${ip} (se esperaba ${pais})`, "Activa el túnel en WireGuard con AllowedIPs = 0.0.0.0/0, ::/0.");
  }

  // 3. Fuga por IPv6: si hay IPv6 pública y el túnel no la cubre, se ve la ubicación real.
  const v6 = await ipv6Wsl();
  if (!v6) anotar("ok", "IPv6", "sin salida IPv6 (no hay fuga por esa vía)");
  else anotar("aviso", "IPv6", `hay salida IPv6 (${v6}); confirma que es del VPN`, "En WireGuard incluye «::/0» en AllowedIPs, o desactiva IPv6 en el adaptador de red de Windows.");

  // 4. Túnel y kill-switch de WireGuard.
  const tunel = await powershell("Get-Service -Name 'WireGuardTunnel$*' -ErrorAction SilentlyContinue | % { \"$($_.Name)=$($_.Status)\" }");
  if (tunel === null || tunel === "") anotar("mal", "Túnel WireGuard", "no hay ningún túnel instalado como servicio", "Instala WireGuard e importa el túnel (docs/VPN.md §2).");
  else anotar(/=Running/.test(tunel) ? "ok" : "mal", "Túnel WireGuard", tunel.replace(/WireGuardTunnel\$/g, ""), /=Running/.test(tunel) ? undefined : "Abre WireGuard y pulsa «Activate».");

  // 5. DNS de Windows: con el túnel activo, el DNS debe ser el del VPN (si no, hay fuga de DNS).
  const dns = await powershell("Get-DnsClientServerAddress -AddressFamily IPv4 | ? { $_.ServerAddresses } | % { \"$($_.InterfaceAlias): $($_.ServerAddresses -join ',')\" }");
  if (dns) {
    const lineas = dns.split("\n").filter(Boolean);
    const delTunel = lineas.filter((l) => /wg|wireguard|geeper/i.test(l));
    if (delTunel.length) anotar("ok", "DNS", delTunel.join(" | "), "WireGuard fuerza su DNS mientras el túnel está activo; confírmalo en dnsleaktest.com si quieres.");
    else anotar("aviso", "DNS", lineas.join(" | "), "El .conf del túnel debe tener una línea «DNS = …» del proveedor. Comprueba en dnsleaktest.com.");
  }

  // 6. Coherencia de Windows con el país (zona horaria, ubicación, idioma). Solo informa.
  const sistema = await powershell("(Get-TimeZone).Id; (Get-WinHomeLocation).HomeLocation; (Get-Culture).Name; (Get-WinSystemLocale).Name");
  if (sistema) {
    const [zona, ubicacion, cultura, locale] = sistema.split("\n");
    anotar("aviso", "Windows: zona y región", `zona «${zona}», ubicación «${ubicacion}», formato ${cultura}, locale ${locale}`,
      `Si quieres que coincidan con ${pais}: Configuración → Hora e idioma → Fecha y hora (zona horaria) y → Región (país o región). Ver docs/VPN.md §4.`);
  }
  const ubicacionWin = await powershell("(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location' -ErrorAction SilentlyContinue).Value");
  if (ubicacionWin === "Allow") anotar("aviso", "Servicio de ubicación de Windows", "activado: el GPS o el Wi-Fi pueden revelar la ubicación real a apps y navegadores", "Configuración → Privacidad y seguridad → Ubicación → desactivar.");
  else if (ubicacionWin) anotar("ok", "Servicio de ubicación de Windows", "desactivado");

  for (const f of filas) {
    const marca = f.nivel === "ok" ? "\x1b[32m✓\x1b[0m" : f.nivel === "aviso" ? "\x1b[33m!\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`${marca} ${f.nombre}: ${f.detalle}`);
    if (f.arreglo && f.nivel !== "ok") console.log(`    → ${f.arreglo}`);
  }
  const malas = filas.filter((f) => f.nivel === "mal").length;
  console.log(malas ? `\n${malas} problema(s): el equipo NO sale completo por ${pais}.` : `\nTodo el equipo sale por ${pais}.`);
  await db.$disconnect();
  process.exit(malas ? 1 : 0);
}
void main();
