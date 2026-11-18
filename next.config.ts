import type { NextConfig } from "next";

const config: NextConfig = {
  // Geeper corre sólo en esta PC; los módulos nativos se cargan en el servidor.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  devIndicators: false,
  agentRules: false,
};

export default config;
