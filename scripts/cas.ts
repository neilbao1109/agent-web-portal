#!/usr/bin/env bun
/**
 * CAS Stack launcher script
 *
 * Usage:
 *   bun run cas:api              # Start CAS local dev server (bun)
 *   bun run cas:webui            # Start CAS webui dev server
 *   bun run cas:webui --url <x>  # Start CAS webui with custom API endpoint
 *   bun run cas:dev              # Start both API and WebUI in parallel
 *
 *   bun run cas:deploy           # Deploy both API and WebUI to AWS
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { config } from "node:process";

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
const stackDir = join(rootDir, "packages/cas-stack");
const webuiDir = join(rootDir, "packages/cas-webui");

// Get ports from environment
const CAS_API_PORT = process.env.CAS_API_PORT || "3550";
const CAS_WEBUI_PORT = process.env.CAS_WEBUI_PORT || "5174";

function run(
  cwd: string,
  cmd: string,
  cmdArgs: string[],
  env?: Record<string, string>
): ChildProcess {
  const proc = spawn(cmd, cmdArgs, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });

  return proc;
}

function runAndWait(
  cwd: string,
  cmd: string,
  cmdArgs: string[],
  env?: Record<string, string>
): Promise<number> {
  return new Promise((resolve) => {
    const proc = run(cwd, cmd, cmdArgs, env);
    proc.on("exit", (code) => {
      resolve(code ?? 0);
    });
  });
}

function runSync(
  cwd: string,
  cmd: string,
  cmdArgs: string[],
  env?: Record<string, string>
): boolean {
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  return result.status === 0;
}

if (command === "api") {
  console.log(`🚀 Starting CAS local dev server on port ${CAS_API_PORT}...`);
  const proc = run(stackDir, "bun", ["run", "server.ts"], { PORT: CAS_API_PORT });
  proc.on("exit", (code) => process.exit(code ?? 0));
} else if (command === "webui") {
  const urlIndex = restArgs.indexOf("--url");
  const customUrl = urlIndex !== -1 ? restArgs[urlIndex + 1] : undefined;

  if (customUrl) {
    console.log(`🌐 Starting CAS webui with API: ${customUrl}`);
    const proc = run(webuiDir, "bun", ["run", "dev", "--", "--url", customUrl]);
    proc.on("exit", (code) => process.exit(code ?? 0));
  } else {
    console.log(
      `🌐 Starting CAS webui on port ${CAS_WEBUI_PORT} (API: localhost:${CAS_API_PORT})...`
    );
    const proc = run(webuiDir, "bun", ["run", "dev"]);
    proc.on("exit", (code) => process.exit(code ?? 0));
  }
} else if (command === "dev") {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                  CAS Stack Development Mode                  ║
╠══════════════════════════════════════════════════════════════╣
║  API:    http://localhost:${CAS_API_PORT.padEnd(5)}                            ║
║  WebUI:  http://localhost:${CAS_WEBUI_PORT.padEnd(5)}                            ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Start both API and WebUI in parallel
  const apiProc = run(stackDir, "bun", ["run", "server.ts"], { PORT: CAS_API_PORT });
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
  console.log("🚀 Deploying CAS Stack to AWS...\n");

  // Step 1: Deploy API stack
  console.log("📦 Step 1/2: Deploying CAS API stack (Lambda + API Gateway)...\n");
  const apiSuccess = runSync(stackDir, "sam", ["deploy"]);

  if (!apiSuccess) {
    console.error("\n❌ API deployment failed. Aborting.");
    process.exit(1);
  }

  console.log("\n✅ API stack deployed successfully!\n");

  // Step 2: Deploy WebUI
  console.log("🌐 Step 2/2: Deploying CAS WebUI (S3 + CloudFront)...\n");
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
CAS Stack Launcher

Usage:
  bun run scripts/cas.ts api              # Start CAS local dev server
  bun run scripts/cas.ts webui            # Start CAS webui dev server
  bun run scripts/cas.ts webui --url <x>  # Start CAS webui with custom API
  bun run scripts/cas.ts dev              # Start both API and WebUI

  bun run scripts/cas.ts deploy           # Deploy both API and WebUI to AWS

Environment Variables (from root .env):
  CAS_API_PORT    = ${CAS_API_PORT}
  CAS_WEBUI_PORT  = ${CAS_WEBUI_PORT}
`);
  process.exit(1);
}
