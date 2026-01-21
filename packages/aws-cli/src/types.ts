/**
 * Type definitions for AWS CLI
 */

import type { SkillFrontmatter } from "@agent-web-portal/core";

/**
 * AWP configuration file (awp.json)
 */
export interface AwpConfig {
  /** AWS profile name (optional, uses default if not set) */
  profile?: string;
  /** AWS region */
  region?: string;
  /** S3 bucket for skills */
  bucket?: string;
  /** S3 key prefix for skills */
  prefix?: string;
  /** Path to skills folder */
  skillsFolder?: string;
}

/**
 * Skill metadata parsed from SKILL.md frontmatter
 */
export interface SkillMetadata {
  /** Skill name (from folder name or frontmatter) */
  name: string;
  /** Skill folder path */
  folderPath: string;
  /** Parsed frontmatter */
  frontmatter: SkillFrontmatter;
  /** Raw markdown content */
  markdown: string;
}

/**
 * Skill entry in skills.yaml
 */
export interface SkillYamlEntry {
  /** Skill name */
  name: string;
  /** S3 key for the skill zip file */
  s3Key: string;
  /** Skill frontmatter metadata */
  frontmatter: SkillFrontmatter;
}

/**
 * Skills.yaml file structure
 */
export interface SkillsYaml {
  /** S3 bucket name */
  bucket: string;
  /** S3 key prefix */
  prefix: string;
  /** List of skills */
  skills: SkillYamlEntry[];
}

/**
 * Upload command options
 */
export interface UploadOptions {
  /** S3 bucket name */
  bucket: string;
  /** S3 key prefix */
  prefix: string;
  /** Skills folder path */
  folder: string;
  /** AWS profile (optional) */
  profile?: string;
  /** AWS region (optional) */
  region?: string;
  /** Output path for skills.yaml */
  output?: string;
  /** Dry run (don't actually upload) */
  dryRun?: boolean;
}

/**
 * Check-env command result
 */
export interface CheckEnvResult {
  /** AWS CLI installed */
  awsCliInstalled: boolean;
  /** AWS CLI version */
  awsCliVersion?: string;
  /** SAM CLI installed */
  samCliInstalled: boolean;
  /** SAM CLI version */
  samCliVersion?: string;
  /** AWS profiles configured */
  profiles: string[];
  /** Default profile */
  defaultProfile?: string;
  /** Current credentials valid */
  credentialsValid: boolean;
  /** Error messages */
  errors: string[];
  /** Warning messages */
  warnings: string[];
}
