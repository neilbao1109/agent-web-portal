/**
 * Image Workshop - Development Server
 *
 * Starts both backend and frontend development servers in parallel.
 *
 * Usage:
 *   bun run dev              # Start both backend and frontend
 *   bun run dev:backend      # Start only backend (port 3600)
 *   bun run dev:frontend     # Start only frontend (port 5174)
 */

import { spawn, type Subprocess } from "bun";
import { join } from "path";

const ROOT_DIR = join(import.meta.dir, "..");

interface ProcessInfo {
  name: string;
  process: Subprocess;
  color: string;
}

const processes: ProcessInfo[] = [];

function colorize(text: string, color: string): string {
  const colors: Record<string, string> = {
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    yellow: "\x1b[33m",
    green: "\x1b[32m",
    reset: "\x1b[0m",
  };
  return `${colors[color] || ""}${text}${colors.reset}`;
}

async function startBackend(): Promise<Subprocess> {
  console.log(colorize("[backend] Starting development server...", "cyan"));
  
  const proc = spawn({
    cmd: ["bun", "run", "backend/server.ts"],
    cwd: ROOT_DIR,
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      PORT: "3600",
    },
  });

  return proc;
}

async function startFrontend(): Promise<Subprocess> {
  console.log(colorize("[frontend] Starting Vite development server...", "magenta"));
  
  const proc = spawn({
    cmd: ["bun", "run", "vite", "--config", "frontend/vite.config.ts"],
    cwd: ROOT_DIR,
    stdout: "inherit",
    stderr: "inherit",
  });

  return proc;
}

async function cleanup(): Promise<void> {
  console.log("\n" + colorize("Shutting down...", "yellow"));
  
  for (const { name, process } of processes) {
    console.log(colorize(`[${name}] Stopping...`, "yellow"));
    process.kill();
  }

  // Wait a bit for processes to terminate
  await new Promise((resolve) => setTimeout(resolve, 500));
  process.exit(0);
}

async function main(): Promise<void> {
  console.log();
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         Image Workshop - Development Environment           ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(colorize("Starting development servers...", "green"));
  console.log();

  // Handle termination signals
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    // Start both servers in parallel
    const [backendProc, frontendProc] = await Promise.all([
      startBackend(),
      startFrontend(),
    ]);

    processes.push(
      { name: "backend", process: backendProc, color: "cyan" },
      { name: "frontend", process: frontendProc, color: "magenta" }
    );

    console.log();
    console.log(colorize("Development servers started:", "green"));
    console.log(colorize("  Backend:  http://localhost:3600", "cyan"));
    console.log(colorize("  Frontend: http://localhost:5174", "magenta"));
    console.log();
    console.log(colorize("Press Ctrl+C to stop all servers", "yellow"));
    console.log();

    // Wait for processes to exit
    await Promise.race([
      backendProc.exited,
      frontendProc.exited,
    ]);

    // If one exits, clean up the other
    await cleanup();
  } catch (error) {
    console.error("Failed to start development servers:", error);
    await cleanup();
    process.exit(1);
  }
}

main();
