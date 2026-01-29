#!/usr/bin/env bun
/**
 * Examples launcher script
 *
 * Usage:
 *   bun run examples:api              # Start local dev server (bun)
 *   bun run examples:api --prod       # Start SAM local (Lambda simulation)
 *
 *   bun run examples:webui            # Start webui with bun dev server
 *   bun run examples:webui --url <x>  # Start webui with custom API endpoint
 *
 *   bun run examples:dev              # Start both API and WebUI in parallel
 *
 *   bun run examples:deploy           # Deploy both API and WebUI to AWS
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";

// Load .env from root
const envPath = join(import.meta.dir, "..", ".env");
const envFile = Bun.file(envPath);
if (await envFile.exists()) {
  const envContent = await envFile.text();
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join("=").trim();
      }
    }
  }
}

const args = process.argv.slice(2);
const command = args[0]; // 'api', 'webui', 'dev', or 'deploy'
const restArgs = args.slice(1);

const rootDir = join(import.meta.dir, "..");
const stackDir = join(rootDir, "packages/example-stack");
const webuiDir = join(rootDir, "packages/example-webui");

// Get ports from environment
const EXAMPLES_API_PORT = process.env.EXAMPLES_API_PORT || "3400";
const EXAMPLES_WEBUI_PORT = process.env.EXAMPLES_WEBUI_PORT || "5173";

function run(cwd: string, cmd: string, cmdArgs: string[], env?: Record<string, string>): ChildProcess {
  const proc = spawn(cmd, cmdArgs, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });

  return proc;
}

function runSync(cwd: string, cmd: string, cmdArgs: string[], env?: Record<string, string>): boolean {
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  return result.status === 0;
}

if (command === "api") {
  const isProd = restArgs.includes("--prod");

  if (isProd) {
    console.log("🚀 Starting SAM local (Lambda simulation) on port 3456...");
    const proc = run(stackDir, "bun", ["run", "dev:sam"]);
    proc.on("exit", (code) => process.exit(code ?? 0));
  } else {
    console.log(`🚀 Starting local dev server on port ${EXAMPLES_API_PORT}...`);
    const proc = run(stackDir, "bun", ["run", "dev"], { PORT: EXAMPLES_API_PORT });
    proc.on("exit", (code) => process.exit(code ?? 0));
  }
} else if (command === "webui") {
  const urlIndex = restArgs.indexOf("--url");
  const customUrl = urlIndex !== -1 ? restArgs[urlIndex + 1] : undefined;

  if (customUrl) {
    console.log(`🌐 Starting webui with API: ${customUrl}`);
    const proc = run(webuiDir, "bun", ["run", "dev", "--", "--url", customUrl]);
    proc.on("exit", (code) => process.exit(code ?? 0));
  } else {
    console.log(`🌐 Starting webui on port ${EXAMPLES_WEBUI_PORT} (API: localhost:${EXAMPLES_API_PORT})...`);
    const proc = run(webuiDir, "bun", ["run", "dev"]);
    proc.on("exit", (code) => process.exit(code ?? 0));
  }
} else if (command === "dev") {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║               Examples Stack Development Mode                ║
╠══════════════════════════════════════════════════════════════╣
║  API:    http://localhost:${EXAMPLES_API_PORT.padEnd(5)}                            ║
║  WebUI:  http://localhost:${EXAMPLES_WEBUI_PORT.padEnd(5)}                            ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Start both API and WebUI in parallel
  const apiProc = run(stackDir, "bun", ["run", "dev"], { PORT: EXAMPLES_API_PORT });
  const webuiProc = run(webuiDir, "bun", ["run", "dev"]);

  // Handle exit
  let exiting = false;
  const cleanup = () => {
    if (exiting) return;
    exiting = true;
    apiProc.kill();
    webuiProc.kill();
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Wait for either to exit
  apiProc.on("exit", (code) => {
    console.log(`\n❌ API server exited with code ${code}`);
    cleanup();
    process.exit(code ?? 1);
  });

  webuiProc.on("exit", (code) => {
    console.log(`\n❌ WebUI server exited with code ${code}`);
    cleanup();
    process.exit(code ?? 1);
  });
} else if (command === "deploy") {
  console.log("🚀 Deploying examples to AWS...\n");

  // Step 1: Deploy API stack
  console.log("📦 Step 1/2: Deploying API stack (Lambda + API Gateway + Skills)...\n");
  const apiSuccess = runSync(stackDir, "bun", ["run", "deploy"]);

  if (!apiSuccess) {
    console.error("\n❌ API deployment failed. Aborting.");
    process.exit(1);
  }

  console.log("\n✅ API stack deployed successfully!\n");

  // Step 2: Deploy WebUI
  console.log("🌐 Step 2/2: Deploying WebUI (S3 + CloudFront)...\n");
  const webuiSuccess = runSync(webuiDir, "bun", ["run", "build"]);

  if (!webuiSuccess) {
    console.error("\n❌ WebUI build failed. Aborting.");
    process.exit(1);
  }

  const deploySuccess = runSync(webuiDir, "bun", ["run", "deploy"]);

  if (!deploySuccess) {
    console.error("\n❌ WebUI deployment failed.");
    process.exit(1);
  }

  console.log("\n✅ WebUI deployed successfully!");
  console.log("\n🎉 All deployments complete!");
} else {
  console.log(`
Examples Stack Launcher

Usage:
  bun run scripts/examples.ts api              # Start local dev server
  bun run scripts/examples.ts api --prod       # Start SAM local

  bun run scripts/examples.ts webui            # Start webui (bun dev server)
  bun run scripts/examples.ts webui --url <x>  # Start webui with custom API

  bun run scripts/examples.ts dev              # Start both API and WebUI

  bun run scripts/examples.ts deploy           # Deploy both API and WebUI to AWS

Environment Variables (from root .env):
  EXAMPLES_API_PORT    = ${EXAMPLES_API_PORT}
  EXAMPLES_WEBUI_PORT  = ${EXAMPLES_WEBUI_PORT}
`);
  process.exit(1);
}