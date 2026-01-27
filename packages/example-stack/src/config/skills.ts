/**
 * Skills Configuration
 *
 * This file defines the S3 bucket configuration for skills.
 * Used by:
 * - upload-skills.ts (deployment script)
 * - Local dev server (optional, for S3 testing)
 */

export interface SkillsConfig {
  /**
   * S3 bucket name for skills storage
   * If not set, will try to read from:
   * 1. SKILLS_BUCKET environment variable
   * 2. CloudFormation stack outputs (after deployment)
   */
  bucket?: string;

  /**
   * S3 key prefix for skills
   * Default: "skills/"
   */
  prefix: string;

  /**
   * AWS region
   * Default: from AWS_REGION env or "us-east-1"
   */
  region?: string;
}

/**
 * Get skills configuration
 */
export function getSkillsConfig(): SkillsConfig {
  return {
    bucket: process.env.SKILLS_BUCKET || undefined,
    prefix: process.env.SKILLS_PREFIX || "skills/",
    region: process.env.AWS_REGION || "us-east-1",
  };
}

/**
 * CloudFormation stack name (used to derive bucket name)
 */
export const STACK_NAME = process.env.STACK_NAME || "awp-examples";

/**
 * Get the expected skills bucket name for a stack
 * This matches the naming convention in template.yaml:
 * !Sub "${AWS::StackName}-skills-${AWS::AccountId}"
 */
export async function getStackSkillsBucket(stackName: string = STACK_NAME): Promise<string | null> {
  try {
    const { CloudFormationClient, DescribeStacksCommand } = await import(
      "@aws-sdk/client-cloudformation"
    );
    const cf = new CloudFormationClient({});

    const response = await cf.send(
      new DescribeStacksCommand({
        StackName: stackName,
      })
    );

    const outputs = response.Stacks?.[0]?.Outputs || [];
    const skillsBucketOutput = outputs.find((o) => o.OutputKey === "SkillsBucket");

    return skillsBucketOutput?.OutputValue || null;
  } catch {
    return null;
  }
}
