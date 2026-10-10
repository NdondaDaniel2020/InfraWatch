/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/components": path.resolve(__dirname, "./src/components"),
      "@/hooks": path.resolve(__dirname, "./src/hooks"),
      "@/services": path.resolve(__dirname, "./src/services"),
      "@/styles": path.resolve(__dirname, "./src/styles"),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    css: true,
  },
});
