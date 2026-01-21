/**
 * check-env command implementation
 *
 * Checks AWS and SAM CLI installation and configuration
 */

import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import chalk from "chalk";
import type { CheckEnvResult } from "./types.ts";

const execAsync = promisify(exec);

/**
 * Check environment for AWS deployment
 */
export async function checkEnv(): Promise<CheckEnvResult> {
  const result: CheckEnvResult = {
    awsCliInstalled: false,
    samCliInstalled: false,
    profiles: [],
    credentialsValid: false,
    errors: [],
    warnings: [],
  };

  // Check AWS CLI
  try {
    const { stdout } = await execAsync("aws --version");
    result.awsCliInstalled = true;
    result.awsCliVersion = stdout.trim().split(" ")[0]?.replace("aws-cli/", "");
  } catch {
    result.errors.push("AWS CLI is not installed");
  }

  // Check SAM CLI
  try {
    const { stdout } = await execAsync("sam --version");
    result.samCliInstalled = true;
    result.samCliVersion = stdout.trim().replace("SAM CLI, version ", "");
  } catch {
    result.warnings.push("SAM CLI is not installed (optional, needed for local testing)");
  }

  // Check AWS profiles
  const credentialsPath = join(homedir(), ".aws", "credentials");
  const configPath = join(homedir(), ".aws", "config");

  if (existsSync(credentialsPath)) {
    const content = readFileSync(credentialsPath, "utf-8");
    const profileMatches = content.match(/\[([^\]]+)\]/g);
    if (profileMatches) {
      result.profiles = profileMatches.map((m) => m.slice(1, -1));
    }
  }

  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    const profileMatches = content.match(/\[profile ([^\]]+)\]/g);
    if (profileMatches) {
      const configProfiles = profileMatches.map((m) => m.replace("[profile ", "").replace("]", ""));
      for (const p of configProfiles) {
        if (!result.profiles.includes(p)) {
          result.profiles.push(p);
        }
      }
    }
    // Check for default profile in config
    if (content.includes("[default]")) {
      result.defaultProfile = "default";
    }
  }

  if (result.profiles.length === 0) {
    result.errors.push("No AWS profiles configured");
  }

  // Check if credentials are valid
  if (result.awsCliInstalled) {
    try {
      await execAsync("aws sts get-caller-identity");
      result.credentialsValid = true;
    } catch {
      result.errors.push("AWS credentials are not valid or expired");
    }
  }

  return result;
}

/**
 * Print check-env results to console
 */
export function printCheckEnvResult(result: CheckEnvResult): void {
  console.log(chalk.bold("\n🔍 AWS Environment Check\n"));

  // AWS CLI
  if (result.awsCliInstalled) {
    console.log(chalk.green(`✓ AWS CLI installed (v${result.awsCliVersion})`));
  } else {
    console.log(chalk.red("✗ AWS CLI not installed"));
    console.log(
      chalk.dim(
        "  Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
      )
    );
  }

  // SAM CLI
  if (result.samCliInstalled) {
    console.log(chalk.green(`✓ SAM CLI installed (v${result.samCliVersion})`));
  } else {
    console.log(chalk.yellow("⚠ SAM CLI not installed (optional)"));
    console.log(
      chalk.dim(
        "  Install: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
      )
    );
  }

  // Profiles
  console.log("");
  if (result.profiles.length > 0) {
    console.log(chalk.green(`✓ AWS profiles configured: ${result.profiles.join(", ")}`));
    if (result.defaultProfile) {
      console.log(chalk.dim(`  Default profile: ${result.defaultProfile}`));
    }
  } else {
    console.log(chalk.red("✗ No AWS profiles configured"));
    console.log(chalk.dim("  Run: aws configure"));
  }

  // Credentials
  if (result.credentialsValid) {
    console.log(chalk.green("✓ AWS credentials are valid"));
  } else if (result.awsCliInstalled) {
    console.log(chalk.red("✗ AWS credentials are invalid or expired"));
    console.log(chalk.dim("  Run: aws configure"));
    console.log(
      chalk.dim("  Or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables")
    );
  }

  // Summary
  console.log("");
  if (result.errors.length === 0) {
    console.log(chalk.green.bold("✓ Environment is ready for AWS deployment"));
  } else {
    console.log(chalk.red.bold(`✗ ${result.errors.length} issue(s) need to be resolved`));
  }
  console.log("");
}
