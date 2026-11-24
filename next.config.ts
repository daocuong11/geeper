import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Geeper corre sólo en esta PC; los módulos nativos se cargan en el servidor.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  devIndicators: false,
  // Raíz fija: sin esto Turbopack vigila ~/dev/dimerso/products y cualquier cambio en Farol u otro
  // producto hermano lo hace recompilar y recargar la página en bucle.
  turbopack: { root: path.resolve(__dirname) },
  agentRules: false,
  // App de escritorio (scripts/escritorio/empaquetar.ts): servidor autocontenido para que lo arranque Electron.
  // Carpeta propia para no pisar el .next del servidor que esté corriendo.
  ...(process.env.GEEPER_STANDALONE === "1" ? { output: "standalone" as const, distDir: ".next-escritorio" } : {}),
};

export default config;
