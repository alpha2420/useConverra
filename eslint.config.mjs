import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Allow 'any' type — necessary for rapid development and legacy code
      "@typescript-eslint/no-explicit-any": "off",
      // Downgrade unused vars to warning only
      "@typescript-eslint/no-unused-vars": "warn",
      // Allow require() imports in scripts
      "@typescript-eslint/no-require-imports": "off",
      // Allow @ts-ignore (legacy code uses it)
      "@typescript-eslint/ban-ts-comment": "off",
      // Allow let where const would work (minor)
      "prefer-const": "warn",
      // Allow this aliasing in legacy JS
      "@typescript-eslint/no-this-alias": "off",
      // Next.js module variable — off for now (whatsapp-web.js uses it)
      "@next/next/no-assign-module-variable": "off",
      // React rules
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
      "react/jsx-no-comment-textnodes": "warn",
    }
  },
  globalIgnores([
    // Build artifacts
    ".next/**",
    "frontend/.next/**",
    "out/**",
    "build/**",
    // Dependencies
    "node_modules/**",
    // Scratch / one-off scripts
    "scratch/**",
    "check_db.js",
    "test_connect.ts",
    // Public JS (embedded widget — not TypeScript)
    "public/**",
    // Analytics chart components (canvas/animation patterns conflict with hook rules)
    "frontend/components/analytics/**",
    // Admin portal pages (complex legacy admin UI)
    "frontend/app/admin-portal/**",
    // Auto-generated
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
