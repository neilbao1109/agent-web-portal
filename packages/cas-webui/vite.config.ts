import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// API URL: defaults to local dev server, can override with --url flag
// Usage:
//   bun run dev                    -> uses http://localhost:3500 (local CAS server)
//   bun run dev --url <endpoint>   -> uses custom API endpoint
const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
let apiUrl = "http://localhost:3500"; // default: local CAS server

if (urlIndex !== -1 && args[urlIndex + 1]) {
  apiUrl = args[urlIndex + 1];
}

console.log(`[vite] Proxying API requests to: ${apiUrl}`);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/",
  // Polyfill Node.js globals for browser (required by amazon-cognito-identity-js)
  define: {
    global: "globalThis",
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
  },
  server: {
    proxy: {
      "/api": {
        target: apiUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
