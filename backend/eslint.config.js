import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "drizzle", "convex/_generated"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Agent-first: keep the type system honest. Ban the two escape hatches
      // that let AI-written code silently defeat strict mode.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    // createApp() must build everything from its deps (ADR 0005 rule 2, ADR
    // 0010): nothing it reaches may read the environment or a process-wide
    // singleton. Only the env side (fromEnv and the entries) may.
    files: ["src/**/*.ts"],
    ignores: [
      "src/**/*.test.ts",
      "src/env.ts",
      "src/from-env.ts",
      "src/app.ts",
      "src/index.ts",
      "src/azure.ts",
      "src/store/index.ts",
      "src/storage/index.ts",
      "src/email/index.ts",
      "src/convex-client.ts",
      "src/db/client.ts",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "(^|/)(env|from-env|app|convex-client)\\.ts$|(^|/)(store|storage|email)/index\\.ts$|^\\.?/index\\.ts$|(^|/)db/client\\.ts$",
              allowTypeImports: true,
              message:
                "This reads the environment or a process-wide singleton. Take it from the app's deps (c.get(\"deps\")) instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // Tests may assert a value they control is present; `!` is fine there.
    files: ["test/**", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
