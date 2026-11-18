import { defineConfig } from "prisma/config";
import { rutaBaseDatos } from "./src/lib/rutas";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: `file:${rutaBaseDatos()}` },
});
