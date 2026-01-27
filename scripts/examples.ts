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
 *   bun run examples:deploy           # Deploy both API and WebUI to AWS
 */

import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const command = args[0]; // 'api', 'webui', or 'deploy'
const restArgs = args.slice(1);

const rootDir = join(import.meta.dir, "..");
const stackDir = join(rootDir, "packages/example-stack");
const webuiDir = join(rootDir, "packages/example-webui");

function run(cwd: string, cmd: string, cmdArgs: string[]) {
  const proc = spawn(cmd, cmdArgs, {
    cwd,
    stdio: "inherit",
    shell: true,
  });

  proc.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

function runSync(cwd: string, cmd: string, cmdArgs: string[]): boolean {
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    stdio: "inherit",
    shell: true,
  });
  return result.status === 0;
}

if (command === "api") {
  const isProd = restArgs.includes("--prod");

  if (isProd) {
    console.log("🚀 Starting SAM local (Lambda simulation) on port 3456...");
    run(stackDir, "bun", ["run", "dev:sam"]);
  } else {
    console.log("🚀 Starting local dev server on port 3400...");
    run(stackDir, "bun", ["run", "dev"]);
  }
} else if (command === "webui") {
  const urlIndex = restArgs.indexOf("--url");
  const customUrl = urlIndex !== -1 ? restArgs[urlIndex + 1] : undefined;

  if (customUrl) {
    console.log(`🌐 Starting webui with API: ${customUrl}`);
    run(webuiDir, "bun", ["run", "dev", "--", "--url", customUrl]);
  } else {
    console.log("🌐 Starting webui with bun dev server (localhost:3400)...");
    run(webuiDir, "bun", ["run", "dev"]);
  }
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
Usage:
  bun run scripts/examples.ts api              # Start local dev server
  bun run scripts/examples.ts api --prod       # Start SAM local

  bun run scripts/examples.ts webui            # Start webui (bun dev server)
  bun run scripts/examples.ts webui --url <x>  # Start webui with custom API

  bun run scripts/examples.ts deploy           # Deploy both API and WebUI to AWS
`);
  process.exit(1);
}