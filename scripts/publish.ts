#!/usr/bin/env bun
/**
 * Publish preparation script for @agent-web-portal packages
 *
 * Features:
 * - Lists all publishable packages
 * - Compares versions with npm registry
 * - Prepares packages in .publish folder (replaces workspace:* with real versions)
 * - Shows publish order and commands
 *
 * Usage:
 *   bun run scripts/publish.ts
 *
 * After running, manually publish each package in order:
 *   cd .publish/core && npm publish --access public
 *   cd .publish/auth && npm publish --access public
 *   ...
 */

import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// =============================================================================
// Types
// =============================================================================

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  files?: string[];
  [key: string]: unknown;
}

interface PackageInfo {
  name: string;
  version: string;
  path: string;
  packageJson: PackageJson;
  internalDeps: string[];
}

// =============================================================================
// Configuration
// =============================================================================

const ROOT_DIR = resolve(import.meta.dirname, "..");
const PACKAGES_DIR = join(ROOT_DIR, "packages");
const PUBLISH_DIR = join(ROOT_DIR, ".publish");

// Packages to publish (in rough order, will be sorted topologically)
const PUBLISHABLE_PACKAGES = ["core", "auth", "client", "aws-lambda", "aws-cli"];

// Our scope
const SCOPE = "@agent-web-portal";

// =============================================================================
// Utilities
// =============================================================================

function log(message: string) {
  console.log(`\x1b[36m[publish]\x1b[0m ${message}`);
}

function success(message: string) {
  console.log(`\x1b[32m✓\x1b[0m ${message}`);
}

function warn(message: string) {
  console.log(`\x1b[33m⚠\x1b[0m ${message}`);
}

function error(message: string) {
  console.error(`\x1b[31m✗\x1b[0m ${message}`);
}

function exec(command: string, options: { cwd?: string; silent?: boolean } = {}): string {
  try {
    const result = execSync(command, {
      cwd: options.cwd ?? ROOT_DIR,
      encoding: "utf-8",
      stdio: options.silent ? "pipe" : "inherit",
    });
    return result?.toString().trim() ?? "";
  } catch (e: any) {
    if (options.silent) {
      // Re-throw with stderr content for silent mode
      const stderr = e?.stderr?.toString() || e?.stdout?.toString() || e?.message || "";
      const err = new Error(stderr);
      (err as any).originalError = e;
      throw err;
    }
    throw e;
  }
}

// =============================================================================
// Package Discovery
// =============================================================================

function discoverPackages(): PackageInfo[] {
  const packages: PackageInfo[] = [];

  for (const pkgName of PUBLISHABLE_PACKAGES) {
    const pkgPath = join(PACKAGES_DIR, pkgName);
    const pkgJsonPath = join(pkgPath, "package.json");

    if (!existsSync(pkgJsonPath)) {
      warn(`Package ${pkgName} not found at ${pkgPath}`);
      continue;
    }

    const packageJson: PackageJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

    if (packageJson.private) {
      log(`Skipping private package: ${packageJson.name}`);
      continue;
    }

    // Find internal dependencies
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.peerDependencies,
    };

    const internalDeps = Object.keys(allDeps).filter((dep) => dep.startsWith(SCOPE));

    packages.push({
      name: packageJson.name,
      version: packageJson.version,
      path: pkgPath,
      packageJson,
      internalDeps,
    });
  }

  return packages;
}

// =============================================================================
// Topological Sort
// =============================================================================

function topologicalSort(packages: PackageInfo[]): PackageInfo[] {
  const packageMap = new Map(packages.map((p) => [p.name, p]));
  const sorted: PackageInfo[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    const pkg = packageMap.get(name);
    if (!pkg) return;

    visiting.add(name);

    for (const dep of pkg.internalDeps) {
      visit(dep);
    }

    visiting.delete(name);
    visited.add(name);
    sorted.push(pkg);
  }

  for (const pkg of packages) {
    visit(pkg.name);
  }

  return sorted;
}

// =============================================================================
// NPM Registry Check
// =============================================================================

async function getNpmVersion(packageName: string): Promise<string | null> {
  try {
    const result = exec(`npm view ${packageName} version 2>/dev/null`, { silent: true });
    return result || null;
  } catch {
    return null;
  }
}

async function checkVersions(
  packages: PackageInfo[]
): Promise<Map<string, { local: string; npm: string | null; needsPublish: boolean }>> {
  const versions = new Map<string, { local: string; npm: string | null; needsPublish: boolean }>();

  log("Checking versions against npm registry...");

  for (const pkg of packages) {
    const npmVersion = await getNpmVersion(pkg.name);
    const needsPublish = npmVersion !== pkg.version;

    versions.set(pkg.name, {
      local: pkg.version,
      npm: npmVersion,
      needsPublish,
    });

    if (needsPublish) {
      if (npmVersion) {
        log(`  ${pkg.name}: ${npmVersion} → ${pkg.version}`);
      } else {
        log(`  ${pkg.name}: (new) → ${pkg.version}`);
      }
    } else {
      log(`  ${pkg.name}: ${pkg.version} (up to date)`);
    }
  }

  return versions;
}

// =============================================================================
// Publish Preparation
// =============================================================================

function preparePublishDir(pkg: PackageInfo, allPackages: PackageInfo[]): string {
  const publishPath = join(PUBLISH_DIR, basename(pkg.path));

  // Clean and create directory
  if (existsSync(publishPath)) {
    rmSync(publishPath, { recursive: true });
  }
  mkdirSync(publishPath, { recursive: true });

  // Determine files to copy
  const filesToCopy = pkg.packageJson.files ?? ["src"];

  // Always copy these files
  const alwaysCopy = ["package.json", "README.md", "tsconfig.json"];

  // Copy files
  for (const file of [...alwaysCopy, ...filesToCopy]) {
    const srcPath = join(pkg.path, file);
    const destPath = join(publishPath, file);

    if (existsSync(srcPath)) {
      cpSync(srcPath, destPath, { recursive: true });
    }
  }

  // Copy LICENSE from root
  const licenseSrc = join(ROOT_DIR, "LICENSE");
  if (existsSync(licenseSrc)) {
    cpSync(licenseSrc, join(publishPath, "LICENSE"));
  }

  // Modify package.json to replace workspace:* with actual versions
  const pkgJsonPath = join(publishPath, "package.json");
  const pkgJson: PackageJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

  // Build version map
  const versionMap = new Map(allPackages.map((p) => [p.name, p.version]));

  // Replace workspace:* in dependencies
  if (pkgJson.dependencies) {
    for (const [dep, version] of Object.entries(pkgJson.dependencies)) {
      if (version === "workspace:*" && versionMap.has(dep)) {
        pkgJson.dependencies[dep] = `^${versionMap.get(dep)}`;
      }
    }
  }

  // Replace workspace:* in peerDependencies
  if (pkgJson.peerDependencies) {
    for (const [dep, version] of Object.entries(pkgJson.peerDependencies)) {
      if (version === "workspace:*" && versionMap.has(dep)) {
        pkgJson.peerDependencies[dep] = `^${versionMap.get(dep)}`;
      }
    }
  }

  // Write modified package.json
  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");

  return publishPath;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");

  console.log("\n");
  log("Agent Web Portal Publish Preparation");
  log("=====================================\n");

  // Discover packages
  log("Discovering packages...");
  const packages = discoverPackages();
  log(`Found ${packages.length} publishable packages\n`);

  // Sort topologically
  log("Sorting by dependencies...");
  const sorted = topologicalSort(packages);
  log(`Publish order: ${sorted.map((p) => basename(p.path)).join(" → ")}\n`);

  // Check versions
  const versions = await checkVersions(sorted);
  console.log("");

  // Filter packages that need publishing
  const toPublish = force
    ? sorted
    : sorted.filter((p) => versions.get(p.name)?.needsPublish);

  if (toPublish.length === 0) {
    success("All packages are up to date. Nothing to prepare.\n");
    return;
  }

  log(`Will prepare ${toPublish.length} package(s): ${toPublish.map((p) => basename(p.path)).join(", ")}\n`);

  // Prepare publish directory
  log(`Preparing publish directory: ${PUBLISH_DIR}`);
  if (existsSync(PUBLISH_DIR)) {
    rmSync(PUBLISH_DIR, { recursive: true });
  }
  mkdirSync(PUBLISH_DIR, { recursive: true });

  // Prepare each package
  const preparedPaths: string[] = [];

  for (const pkg of toPublish) {
    log(`Preparing ${pkg.name}...`);
    const publishPath = preparePublishDir(pkg, sorted);
    preparedPaths.push(publishPath);
    success(`Prepared: ${publishPath}`);
  }

  // Print manual publish instructions
  console.log("\n");
  log("Preparation Complete!");
  log("=====================\n");
  
  console.log("Packages are ready in .publish/ folder.");
  console.log("Please publish them manually in this order:\n");
  
  for (let i = 0; i < toPublish.length; i++) {
    const pkg = toPublish[i]!;
    const folderName = basename(pkg.path);
    console.log(`  ${i + 1}. cd .publish/${folderName} && npm publish --access public`);
  }

  console.log("\n");
  warn("Note: Each publish will open a browser for OTP verification.");
  console.log("");
  
  log("After publishing all packages, clean up with:");
  console.log("  rm -rf .publish\n");
}

main().catch((e) => {
  error(`Unexpected error: ${e}`);
  process.exit(1);
});
