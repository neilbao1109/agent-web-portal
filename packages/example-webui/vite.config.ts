import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// API URL: defaults to local server, can override with --api flag
// Usage:
//   bun run dev              -> uses http://localhost:3000 (local bun server)
//   bun run dev --api sam    -> uses http://localhost:3456 (SAM local)
//   bun run dev --api https://xxx.execute-api.us-east-1.amazonaws.com/prod -> uses remote API
const args = process.argv.slice(2);
const apiIndex = args.indexOf("--api");
let apiUrl = "http://localhost:3000"; // default: local bun server

if (apiIndex !== -1 && args[apiIndex + 1]) {
  const apiArg = args[apiIndex + 1];
  if (apiArg === "sam") {
    apiUrl = "http://localhost:3456"; // SAM local
  } else {
    apiUrl = apiArg; // custom URL
  }
}

console.log(`[vite] Proxying API requests to: ${apiUrl}`);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
  },
  server: {
    proxy: {
      "/api": apiUrl,
      "/auth": apiUrl,
      "/basic": apiUrl,
      "/ecommerce": apiUrl,
      "/jsonata": apiUrl,
      "/blob": apiUrl,
    },
  },
});
