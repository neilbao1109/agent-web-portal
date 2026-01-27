#!/usr/bin/env bun
/**
 * Examples launcher script
 *
 * Usage:
 *   bun run examples:api              # Start local dev server (bun)
 *   bun run examples:api --prod       # Start SAM local (Lambda simulation)
 *
 *   bun run examples:webui            # Start webui with SAM local API
 *   bun run examples:webui --url <x>  # Start webui with custom API endpoint
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const command = args[0]; // 'api' or 'webui'
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
} else {
	console.log(`
Usage:
  bun run scripts/examples.ts api              # Start local dev server
  bun run scripts/examples.ts api --prod       # Start SAM local

  bun run scripts/examples.ts webui            # Start webui (SAM local API)
  bun run scripts/examples.ts webui --url <x>  # Start webui with custom API
`);
	process.exit(1);
}
