import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // eslint-config-next 15.5 bundles a typescript-eslint whose no-unused-expressions crashes on ESLint 9.39.
  { rules: { "@typescript-eslint/no-unused-expressions": "off", "@typescript-eslint/no-unsafe-declaration-merging": "off" } },
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"] },
];

export default eslintConfig;
