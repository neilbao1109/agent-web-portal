/**
 * Image Workshop - Full Stack Deploy Script
 *
 * Deploys both backend (SAM) and frontend (S3/CloudFront) in sequence.
 *
 * Usage:
 *   bun run deploy              # Deploy everything
 *   bun run deploy:backend      # Deploy only backend (SAM)
 *   bun run deploy:frontend     # Deploy only frontend (S3)
 */

import { $ } from "bun";
import { join } from "path";

const ROOT_DIR = join(import.meta.dir, "..");

async function deployBackend(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Deploying Backend (SAM)");
  console.log("=".repeat(60));
  console.log();

  // Build backend
  console.log("Building backend...");
  await $`bun run build:backend`.cwd(ROOT_DIR);
  console.log();

  // SAM build
  console.log("Running SAM build...");
  await $`sam build`.cwd(ROOT_DIR);
  console.log();

  // SAM deploy
  console.log("Running SAM deploy...");
  await $`sam deploy`.cwd(ROOT_DIR);
  console.log();

  console.log("Backend deployment complete!");
  console.log();
}

async function deployFrontend(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Deploying Frontend");
  console.log("=".repeat(60));
  console.log();

  // Build frontend
  console.log("Building frontend...");
  await $`bun run build:frontend`.cwd(ROOT_DIR);
  console.log();

  // Deploy to S3
  console.log("Uploading to S3...");
  await $`bun run scripts/deploy-frontend.ts`.cwd(ROOT_DIR);
  console.log();

  console.log("Frontend deployment complete!");
  console.log();
}

async function main() {
  console.log();
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         Image Workshop - Full Stack Deployment             ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  const startTime = Date.now();

  try {
    // Deploy backend first
    await deployBackend();

    // Then deploy frontend
    await deployFrontend();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("=".repeat(60));
    console.log(`Full stack deployment complete! (${elapsed}s)`);
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

main();
