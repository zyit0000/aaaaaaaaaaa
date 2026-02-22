// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
const isWindows = process.env.TAURI_ENV_PLATFORM?.toLowerCase() === "windows";
const isDebug = process.env.TAURI_ENV_DEBUG === "true";

export default defineConfig({
  plugins: [react()],
  // Tauri expects a fixed port in dev mode
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  // Env variables exposed to the frontend
  envPrefix: ["VITE_", "TAURI_"],

  build: {
    // Tauri supports ES2021
    target: isWindows ? "chrome105" : "safari13",
    // Don't minify for debug builds
    minify: isDebug ? false : "esbuild",
    sourcemap: isDebug,
  },
});
