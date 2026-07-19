import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // React Hooks'un stabil iki temel kuralı. Plugin'in React Compiler'a özel
      // deneysel kuralları mevcut React 18 kodunu topluca yeniden yazmayı
      // gerektirdiğinden ayrı bir migration çalışmasına bırakılıyor.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Mevcut servis/model mapper'larında bilinçli any kullanımları var. Lint
      // hattını ilk günden yüzlerce mekanik değişikliğe bağlamadan diğer gerçek
      // hataları yakalamaya devam ediyoruz.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // Kod tabanında callback ve keyboard handler'larda `condition && call()`
      // biçimi bilinçli kullanılıyor.
      "@typescript-eslint/no-unused-expressions": "off",
      "no-useless-assignment": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.jest },
  },
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["scripts/clean-admin-seed.js"],
    languageOptions: {
      globals: { db: "readonly", print: "readonly", ObjectId: "readonly" },
    },
  },
);
