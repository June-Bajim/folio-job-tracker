import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "**/.next/**",
      "apps/web/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        Headers: "readonly",
        setTimeout: "readonly",
        window: "readonly",
        FormData: "readonly",
        Request: "readonly",
        AbortSignal: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
