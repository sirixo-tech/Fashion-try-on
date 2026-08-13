import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": webRoot,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["components/**/*.test.tsx", "lib/**/*.test.ts"],
  },
});
