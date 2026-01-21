/**
 * upload command implementation
 *
 * Packages and uploads skills to S3, generates skills.yaml
 */

import {
  createReadStream,
  createWriteStream,
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import archiver from "archiver";
import chalk from "chalk";
import { stringify as stringifyYaml } from "yaml";
import { parseSkillFile, validateFrontmatter } from "./skill-parser.ts";
import type { SkillMetadata, SkillsYaml, SkillYamlEntry, UploadOptions } from "./types.ts";

/**
 * Discover skills in a folder
 * A skill folder must contain a SKILL.md file
 */
export function discoverSkills(folderPath: string): SkillMetadata[] {
  const skills: SkillMetadata[] = [];

  if (!existsSync(folderPath)) {
    throw new Error(`Skills folder not found: ${folderPath}`);
  }

  const entries = readdirSync(folderPath);

  for (const entry of entries) {
    const entryPath = join(folderPath, entry);
    const stat = statSync(entryPath);

    if (!stat.isDirectory()) continue;

    const skillMdPath = join(entryPath, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    // Parse SKILL.md
    const { frontmatter, markdown } = parseSkillFile(skillMdPath);

    // Use folder name as skill name if not specified in frontmatter
    const name = (frontmatter.name as string) ?? entry;

    // Validate frontmatter
    const validation = validateFrontmatter(frontmatter, name);
    if (!validation.valid) {
      console.warn(chalk.yellow(`⚠ Skipping skill "${name}": ${validation.errors.join(", ")}`));
      continue;
    }

    skills.push({
      name,
      folderPath: entryPath,
      frontmatter,
      markdown,
    });
  }

  return skills;
}

/**
 * Create a zip archive of a skill folder
 */
export async function createSkillZip(skill: SkillMetadata, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));

    archive.pipe(output);
    archive.directory(skill.folderPath, false);
    archive.finalize();
  });
}

/**
 * Upload a file to S3
 */
export async function uploadToS3(
  s3Client: S3Client,
  bucket: string,
  key: string,
  filePath: string
): Promise<void> {
  const fileStream = createReadStream(filePath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: "application/zip",
  });

  await s3Client.send(command);
}

/**
 * Upload skills to S3 and generate skills.yaml
 */
export async function uploadSkills(options: UploadOptions): Promise<SkillsYaml> {
  const { bucket, prefix, folder, profile, region, output, dryRun } = options;

  console.log(chalk.bold("\n📦 Uploading Skills to S3\n"));
  console.log(chalk.dim(`Bucket: ${bucket}`));
  console.log(chalk.dim(`Prefix: ${prefix}`));
  console.log(chalk.dim(`Folder: ${folder}`));
  if (dryRun) {
    console.log(chalk.yellow("DRY RUN - no files will be uploaded\n"));
  }
  console.log("");

  // Discover skills
  const skills = discoverSkills(folder);

  if (skills.length === 0) {
    console.log(chalk.yellow("No skills found in the specified folder"));
    return { bucket, prefix, skills: [] };
  }

  console.log(chalk.green(`Found ${skills.length} skill(s)\n`));

  // Create S3 client
  const s3Client = new S3Client({
    region: region ?? process.env.AWS_REGION ?? "us-east-1",
    ...(profile && { credentials: { profile } as any }),
  });

  const skillEntries: SkillYamlEntry[] = [];

  // Process each skill
  for (const skill of skills) {
    const zipFileName = `skill-${skill.name}.zip`;
    const s3Key = prefix ? `${prefix}/${zipFileName}` : zipFileName;
    const tempZipPath = join(folder, zipFileName);

    console.log(chalk.blue(`Processing: ${skill.name}`));

    try {
      // Create zip
      console.log(chalk.dim(`  Creating zip archive...`));
      await createSkillZip(skill, tempZipPath);

      // Upload to S3
      if (!dryRun) {
        console.log(chalk.dim(`  Uploading to s3://${bucket}/${s3Key}...`));
        await uploadToS3(s3Client, bucket, s3Key, tempZipPath);
      } else {
        console.log(chalk.dim(`  Would upload to s3://${bucket}/${s3Key}`));
      }

      // Add to skills list
      skillEntries.push({
        name: skill.name,
        s3Key,
        frontmatter: skill.frontmatter,
      });

      console.log(chalk.green(`  ✓ ${skill.name} uploaded successfully`));

      // Clean up temp zip (optional, keep for debugging)
      // unlinkSync(tempZipPath);
    } catch (error) {
      console.log(chalk.red(`  ✗ Failed to process ${skill.name}: ${error}`));
    }
  }

  // Generate skills.yaml
  const skillsYaml: SkillsYaml = {
    bucket,
    prefix,
    skills: skillEntries,
  };

  const yamlContent = stringifyYaml(skillsYaml);
  const outputPath = output ?? join(folder, "skills.yaml");

  if (!dryRun) {
    writeFileSync(outputPath, yamlContent);
    console.log(chalk.green(`\n✓ Generated ${outputPath}`));
  } else {
    console.log(chalk.yellow(`\nWould generate ${outputPath}:`));
    console.log(chalk.dim(yamlContent));
  }

  console.log(chalk.bold.green(`\n✓ Processed ${skillEntries.length}/${skills.length} skills\n`));

  return skillsYaml;
}
