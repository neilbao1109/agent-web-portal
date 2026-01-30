/**
 * config command implementation
 *
 * Pulls CAS stack outputs from AWS CloudFormation and writes/merges into local .env
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import chalk from "chalk";

const DEFAULT_STACK_NAME = "awp-cas";
const ENV_KEYS = [
  "VITE_COGNITO_USER_POOL_ID",
  "VITE_COGNITO_CLIENT_ID",
  "VITE_API_URL",
  "CAS_API_PORT",
  "CAS_WEBUI_PORT",
] as const;

// Only Cognito IDs by default - local dev uses empty VITE_API_URL so Vite proxy hits localhost
const OUTPUT_TO_ENV: Record<string, (typeof ENV_KEYS)[number]> = {
  UserPoolId: "VITE_COGNITO_USER_POOL_ID",
  UserPoolClientId: "VITE_COGNITO_CLIENT_ID",
};

export interface ConfigOptions {
  /** CloudFormation stack name (default: awp-cas) */
  stackName?: string;
  /** AWS profile */
  profile?: string;
  /** AWS region */
  region?: string;
  /** Path to .env file (default: .env in cwd) */
  envFile?: string;
  /** Dry run: print what would be written, don't write */
  dryRun?: boolean;
}

export interface ConfigResult {
  success: boolean;
  stackName: string;
  envPath: string;
  updated: Record<string, string>;
  errors: string[];
}

/**
 * Parse .env file into key-value map (keeps order of keys we care about)
 */
function parseEnv(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        map.set(key, value);
      }
    }
  }
  return map;
}

/**
 * Serialize env map to .env format (only keys we manage + existing others)
 */
function serializeEnv(env: Map<string, string>, keysToEmit: string[]): string {
  const lines: string[] = [];
  const emitted = new Set<string>();
  for (const key of keysToEmit) {
    const v = env.get(key);
    if (v !== undefined) {
      lines.push(`${key}=${v}`);
      emitted.add(key);
    }
  }
  for (const [k, v] of env) {
    if (!emitted.has(k)) {
      lines.push(`${k}=${v}`);
    }
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

/**
 * Get CAS stack outputs from CloudFormation
 */
async function getStackOutputs(
  stackName: string,
  options: { profile?: string; region?: string }
): Promise<Record<string, string>> {
  const client = new CloudFormationClient({
    region: options.region ?? process.env.AWS_REGION ?? "us-east-1",
    ...(options.profile && process.env.AWS_PROFILE === undefined
      ? {} // profile is usually via AWS_PROFILE or ~/.aws/config
      : {}),
  });
  const response = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  const outputs = response.Stacks?.[0]?.Outputs ?? [];
  const out: Record<string, string> = {};
  for (const o of outputs) {
    if (o.OutputKey && o.OutputValue) {
      out[o.OutputKey] = o.OutputValue;
    }
  }
  return out;
}

/**
 * Pull CAS config from AWS and merge into local .env
 */
export async function pullConfig(options: ConfigOptions = {}): Promise<ConfigResult> {
  const cwd = process.cwd();
  const envPath = options.envFile ? join(cwd, options.envFile) : join(cwd, ".env");
  const stackName = options.stackName ?? process.env.STACK_NAME ?? DEFAULT_STACK_NAME;
  const errors: string[] = [];
  const updated: Record<string, string> = {};

  if (options.profile) {
    process.env.AWS_PROFILE = options.profile;
  }
  try {
    const cfOutputs = await getStackOutputs(stackName, {
      profile: options.profile,
      region: options.region,
    });

    for (const [outputKey, envKey] of Object.entries(OUTPUT_TO_ENV)) {
      const value = cfOutputs[outputKey];
      if (value) {
        updated[envKey] = value;
      }
    }
    // Local dev: leave VITE_API_URL unset so Vite proxy hits localhost
    if (!("VITE_API_URL" in updated)) {
      updated["VITE_API_URL"] = "";
    }

    if (Object.keys(updated).length === 0) {
      const hasStack = cfOutputs.UserPoolId !== undefined;
      if (!hasStack) {
        errors.push(`Stack "${stackName}" has no outputs (not deployed or wrong name?). Deploy with: cd packages/cas-stack && sam deploy`);
      } else {
        errors.push("No Cognito/API outputs found in stack. Check template Outputs.");
      }
      return { success: false, stackName, envPath, updated: {}, errors };
    }

    let env = new Map<string, string>();
    if (existsSync(envPath)) {
      env = parseEnv(readFileSync(envPath, "utf-8"));
    }
    for (const [k, v] of Object.entries(updated)) {
      env.set(k, v);
    }

    const keysToEmit = [...ENV_KEYS];
    const newContent = serializeEnv(env, keysToEmit);

    if (options.dryRun) {
      console.log(chalk.dim("[dry-run] Would write to"), envPath);
      console.log(newContent);
      return { success: true, stackName, envPath, updated, errors: [] };
    }

    writeFileSync(envPath, newContent, "utf-8");
    return { success: true, stackName, envPath, updated, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return { success: false, stackName, envPath, updated: {}, errors };
  }
}

export function printConfigResult(result: ConfigResult): void {
  if (result.success) {
    console.log(chalk.green("✓ Config pulled from stack"), chalk.cyan(result.stackName));
    for (const [k, v] of Object.entries(result.updated)) {
      console.log(chalk.dim("  " + k + "="), v);
    }
    console.log(chalk.dim("  Written to"), result.envPath);
  } else {
    console.error(chalk.red("✗ Failed to pull config"));
    for (const e of result.errors) {
      console.error(chalk.red("  " + e));
    }
    console.error(chalk.dim("  Ensure AWS credentials are set (aws configure) and stack is deployed."));
  }
}
