#!/usr/bin/env bun
/**
 * AWP CLI - Agent Web Portal CLI for AWS deployment
 *
 * Usage:
 *   awp check-env          Check AWS environment setup
 *   awp upload             Upload skills to S3
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { checkEnv, printCheckEnvResult } from "../src/check-env.ts";
import type { AwpConfig } from "../src/types.ts";
import { uploadSkills } from "../src/upload.ts";

const program = new Command();

// Load config from awp.json if exists
function loadConfig(): AwpConfig {
  const configPath = resolve(process.cwd(), "awp.json");
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as AwpConfig;
  }
  return {};
}

program.name("awp").description("Agent Web Portal CLI for AWS deployment").version("0.1.0");

// check-env command
program
  .command("check-env")
  .description("Check AWS and SAM CLI installation and configuration")
  .action(async () => {
    const result = await checkEnv();
    printCheckEnvResult(result);
    process.exit(result.errors.length > 0 ? 1 : 0);
  });

// upload command
program
  .command("upload")
  .description("Package and upload skills to S3")
  .option("-b, --bucket <bucket>", "S3 bucket name")
  .option("-p, --prefix <prefix>", "S3 key prefix", "skills")
  .option("-f, --folder <folder>", "Skills folder path")
  .option("--profile <profile>", "AWS profile name")
  .option("--region <region>", "AWS region")
  .option("-o, --output <output>", "Output path for skills.yaml")
  .option("--dry-run", "Dry run (don't actually upload)")
  .action(async (options) => {
    const config = loadConfig();

    const bucket = options.bucket ?? config.bucket;
    const prefix = options.prefix ?? config.prefix ?? "skills";
    const folder = options.folder ?? config.skillsFolder;
    const profile = options.profile ?? config.profile;
    const region = options.region ?? config.region;

    if (!bucket) {
      console.error("Error: --bucket is required (or set in awp.json)");
      process.exit(1);
    }

    if (!folder) {
      console.error("Error: --folder is required (or set skillsFolder in awp.json)");
      process.exit(1);
    }

    try {
      await uploadSkills({
        bucket,
        prefix,
        folder: resolve(process.cwd(), folder),
        profile,
        region,
        output: options.output,
        dryRun: options.dryRun,
      });
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
