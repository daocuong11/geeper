import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  {
    ignores: [".next/**", ".next-escritorio/**", "escritorio-app/**", "dist-escritorio/**", "node_modules/**", "src/generated/**", "next-env.d.ts", "py/**", ".claude/**", "packages/*/dist/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];

export default config;
