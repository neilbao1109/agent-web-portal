#!/usr/bin/env bun
/**
 * Upload Skills to S3
 *
 * This script packages each skill folder into a zip file and uploads it to S3.
 * It supports per-portal skill organization: skills/{portal}/{skill-name}
 *
 * Directory structure:
 *   skills/
 *     basic/              <- portal name
 *       greeting/         <- skill name
 *         SKILL.md
 *         ...
 *     ecommerce/
 *       checkout/
 *         SKILL.md
 *
 * S3 structure:
 *   skills/{portal}/{skill-name}.zip
 *   skills/{portal}/skills-manifest.json
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

  // Check if skills directory uses per-portal structure (portal/skill-name) or flat structure (skill-name)
  const topLevelDirs = readdirSync(SKILLS_DIR).filter((name) => {
    const skillPath = join(SKILLS_DIR, name);
    return statSync(skillPath).isDirectory();
  });

  // Detect structure: if any top-level dir has a SKILL.md, it's flat structure
  // Otherwise, assume per-portal structure (portal/skill-name)
  let isPerPortalStructure = true;
  for (const dir of topLevelDirs) {
    if (existsSync(join(SKILLS_DIR, dir, "SKILL.md"))) {
      isPerPortalStructure = false;
      break;
    }
  }

  const s3 = bucketName ? new S3Client(awsConfig) : null;

  if (isPerPortalStructure) {
    // Per-portal structure: skills/{portal}/{skill-name}
    console.log(`📂 Detected per-portal skills structure`);
    console.log("");

    for (const portalName of topLevelDirs) {
      const portalDir = join(SKILLS_DIR, portalName);
      const portalDistDir = join(DIST_DIR, portalName);

      if (!existsSync(portalDistDir)) {
        mkdirSync(portalDistDir, { recursive: true });
      }

      const skillDirs = readdirSync(portalDir).filter((name) => {
        const skillPath = join(portalDir, name);
        return statSync(skillPath).isDirectory();
      });

      if (skillDirs.length === 0) continue;

      console.log(`📦 Portal: ${portalName} (${skillDirs.length} skills)`);
      const manifest: SkillManifestEntry[] = [];

      for (const skillName of skillDirs) {
        const skillDir = join(portalDir, skillName);

        // Package skill to zip
        const zip = new JSZip();
        let frontmatter: SkillFrontmatter | null = null;

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

              if (file === "SKILL.md" && zipPath === "") {
                frontmatter = parseFrontmatter(content.toString("utf-8"));
              }
            }
          }
        }

        addFilesToZip(skillDir);
        const zipContent = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

        const zipPath = join(portalDistDir, `${skillName}.zip`);
        writeFileSync(zipPath, zipContent);
        console.log(`  - ${skillName} → ${(zipContent.length / 1024).toFixed(2)} KB`);

        // Add to portal manifest
        manifest.push({
          id: skillName,
          url: `/api/awp/${portalName}/skills/${skillName}.zip`,
          frontmatter: frontmatter || { name: skillName },
        });

        // Upload to S3 if bucket provided
        if (s3 && bucketName) {
          const key = `skills/${portalName}/${skillName}.zip`;
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

      // Save portal manifest
      const manifestPath = join(portalDistDir, "skills-manifest.json");
      const manifestContent = JSON.stringify(manifest, null, 2);
      writeFileSync(manifestPath, manifestContent);

      // Upload manifest to S3
      if (s3 && bucketName) {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: `skills/${portalName}/skills-manifest.json`,
            Body: manifestContent,
            ContentType: "application/json",
          })
        );
        console.log(`  📋 Manifest uploaded`);
      }
    }
  } else {
    // Flat structure: skills/{skill-name} (legacy)
    console.log(`📂 Detected flat skills structure (legacy)`);
    console.log("");

    const skills = topLevelDirs;
    console.log(`Found ${skills.length} skills to package:`);

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

      // Add to manifest (use generic /api/awp path - user can specify portal)
      manifest.push({
        id: skillName,
        url: `/api/awp/{portal}/skills/${skillName}.zip`,
        frontmatter: frontmatter || { name: skillName },
      });

      // Upload to S3 if bucket provided (to a 'shared' folder)
      if (s3 && bucketName) {
        const key = `skills/shared/${skillName}.zip`;

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
          Key: "skills/shared/skills-manifest.json",
          Body: manifestContent,
          ContentType: "application/json",
        })
      );
      console.log(`    → Uploaded to s3://${bucketName}/skills/shared/skills-manifest.json`);
    }
  }

  console.log("");
  console.log("✅ Skills packaging complete!");

  if (!bucketName) {
    console.log("");
    console.log("To upload to S3, run:");
    console.log("  bun run scripts/upload-skills.ts <your-bucket-name>");
    console.log("  bun run scripts/upload-skills.ts --stack");
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
