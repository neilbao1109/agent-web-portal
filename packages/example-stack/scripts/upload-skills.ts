#!/usr/bin/env bun
/**
 * Upload Skills to S3
 *
 * This script packages each skill folder into a zip file and uploads it to S3.
 * It also generates a skills-manifest.json with metadata from each SKILL.md frontmatter.
 *
 * Usage:
 *   bun run scripts/upload-skills.ts              # Package only (no upload)
 *   bun run scripts/upload-skills.ts --stack      # Auto-detect bucket from CloudFormation stack
 *   bun run scripts/upload-skills.ts <bucket>     # Upload to specific bucket
 *
 * Environment:
 *   AWS_PROFILE - AWS profile to use (uses default credential chain if not set)
 *   STACK_NAME  - CloudFormation stack name (default: awp-examples)
 */

// Polyfill for JSZip
import "setimmediate";

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import JSZip from "jszip";

const SKILLS_DIR = join(import.meta.dir, "../skills");
const DIST_DIR = join(import.meta.dir, "../dist/skills");
const DEFAULT_STACK_NAME = process.env.STACK_NAME || "awp-examples";

// AWS client config - uses default credential chain (env vars, ~/.aws/credentials, IAM role, etc.)
const awsConfig = {};

interface SkillFrontmatter {
  name: string;
  description?: string;
  version?: string;
  "allowed-tools"?: string[];
  [key: string]: unknown;
}

interface SkillManifestEntry {
  id: string;
  url: string;
  frontmatter: SkillFrontmatter;
}

/**
 * Parse YAML-like frontmatter from SKILL.md
 * Supports: name, description, version, allowed-tools (as array)
 */
function parseFrontmatter(content: string): SkillFrontmatter | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatterText = match[1];
  const result: SkillFrontmatter = { name: "" };

  const lines = frontmatterText.split("\n");
  let currentKey = "";
  let inArray = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for array item
    if (inArray && trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim();
      if (Array.isArray(result[currentKey])) {
        (result[currentKey] as string[]).push(value);
      }
      continue;
    }

    // Check for key: value
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      currentKey = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (value === "") {
        // Could be start of array
        result[currentKey] = [];
        inArray = true;
      } else {
        result[currentKey] = value;
        inArray = false;
      }
    }
  }

  return result;
}

async function packageSkill(
  skillName: string
): Promise<{ zipContent: Buffer; frontmatter: SkillFrontmatter | null }> {
  const skillDir = join(SKILLS_DIR, skillName);
  const zip = new JSZip();
  let frontmatter: SkillFrontmatter | null = null;

  // Recursively add all files in the skill directory
  function addFilesToZip(dir: string, zipPath: string = "") {
    const files = readdirSync(dir);

    for (const file of files) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      const relativePath = zipPath ? `${zipPath}/${file}` : file;

      if (stat.isDirectory()) {
        addFilesToZip(fullPath, relativePath);
      } else {
        const content = readFileSync(fullPath);
        zip.file(relativePath, content);

        // Parse frontmatter from SKILL.md
        if (file === "SKILL.md" && zipPath === "") {
          frontmatter = parseFrontmatter(content.toString("utf-8"));
        }
      }
    }
  }

  addFilesToZip(skillDir);

  const zipContent = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { zipContent, frontmatter };
}

/**
 * Get bucket name from CloudFormation stack outputs
 */
async function getBucketFromStack(stackName: string): Promise<string | null> {
  try {
    const cf = new CloudFormationClient(awsConfig);
    const response = await cf.send(new DescribeStacksCommand({ StackName: stackName }));

    const outputs = response.Stacks?.[0]?.Outputs || [];
    const skillsBucketOutput = outputs.find((o) => o.OutputKey === "SkillsBucketName");

    return skillsBucketOutput?.OutputValue || null;
  } catch (error) {
    console.error(`Failed to get stack ${stackName}:`, (error as Error).message);
    return null;
  }
}

async function main() {
  let bucketName = process.argv[2];
  const stackName = process.argv[3] || DEFAULT_STACK_NAME;

  // Handle --stack flag to auto-detect bucket
  if (bucketName === "--stack") {
    console.log(`🔍 Looking up bucket from CloudFormation stack: ${stackName}`);
    bucketName = (await getBucketFromStack(stackName)) || "";

    if (!bucketName) {
      console.log(`❌ Could not find SkillsBucketName in stack "${stackName}" outputs.`);
      console.log("   Make sure the stack is deployed first with: bun run sam:deploy");
      console.log("");
      console.log("   Continuing with local packaging only...");
      console.log("");
      bucketName = "";
    } else {
      console.log(`✅ Found bucket: ${bucketName}`);
      console.log("");
    }
  }

  if (!bucketName) {
    console.log("Usage:");
    console.log("  bun run scripts/upload-skills.ts              # Package only");
    console.log("  bun run scripts/upload-skills.ts --stack      # Auto-detect bucket from stack");
    console.log("  bun run scripts/upload-skills.ts <bucket>     # Upload to specific bucket");
    console.log("");
    console.log("Skills will be packaged to dist/skills/");
    console.log("");
  }

  // Ensure dist/skills directory exists
  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }

  // Get all skill directories
  const skills = readdirSync(SKILLS_DIR).filter((name) => {
    const skillPath = join(SKILLS_DIR, name);
    return statSync(skillPath).isDirectory();
  });

  console.log(`Found ${skills.length} skills to package:`);

  const s3 = bucketName ? new S3Client(awsConfig) : null;
  const manifest: SkillManifestEntry[] = [];

  for (const skillName of skills) {
    console.log(`  - ${skillName}`);

    // Package skill to zip
    const { zipContent, frontmatter } = await packageSkill(skillName);
    const zipPath = join(DIST_DIR, `${skillName}.zip`);

    // Save to dist/skills/
    writeFileSync(zipPath, zipContent);
    console.log(`    → Saved to ${zipPath} (${(zipContent.length / 1024).toFixed(2)} KB)`);

    if (frontmatter) {
      console.log(`    → Parsed frontmatter: ${frontmatter.name || skillName}`);
    }

    // Add to manifest
    manifest.push({
      id: skillName,
      url: `/api/skills/${skillName}/download`,
      frontmatter: frontmatter || { name: skillName },
    });

    // Upload to S3 if bucket provided
    if (s3 && bucketName) {
      const key = `skills/${skillName}.zip`;

      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: zipContent,
          ContentType: "application/zip",
        })
      );

      console.log(`    → Uploaded to s3://${bucketName}/${key}`);
    }
  }

  // Save manifest
  const manifestPath = join(DIST_DIR, "skills-manifest.json");
  const manifestContent = JSON.stringify(manifest, null, 2);
  writeFileSync(manifestPath, manifestContent);
  console.log(`\n📋 Generated manifest: ${manifestPath}`);

  // Upload manifest to S3
  if (s3 && bucketName) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "skills/skills-manifest.json",
        Body: manifestContent,
        ContentType: "application/json",
      })
    );
    console.log(`    → Uploaded to s3://${bucketName}/skills/skills-manifest.json`);
  }

  console.log("");
  console.log("✅ Skills packaging complete!");

  if (!bucketName) {
    console.log("");
    console.log("To upload to S3, run:");
    console.log("  bun run scripts/upload-skills.ts <your-bucket-name>");
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
