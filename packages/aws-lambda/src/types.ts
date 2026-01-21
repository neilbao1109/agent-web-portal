/**
 * Type definitions for AWS Lambda adapter
 */

import type { SkillFrontmatter } from "@agent-web-portal/core";

/**
 * Skill configuration from skills.yaml
 */
export interface SkillConfig {
  /** Skill name (unique identifier) */
  name: string;
  /** S3 key for the skill zip file */
  s3Key: string;
  /** Skill frontmatter metadata */
  frontmatter: SkillFrontmatter;
}

/**
 * Skills configuration file (skills.yaml)
 */
export interface SkillsConfig {
  /** S3 bucket name */
  bucket: string;
  /** S3 key prefix */
  prefix: string;
  /** List of skills */
  skills: SkillConfig[];
}

/**
 * Lambda adapter options
 */
export interface LambdaAdapterOptions {
  /** Path to skills.yaml configuration */
  skillsConfigPath?: string;
  /** Or provide skills config directly */
  skillsConfig?: SkillsConfig;
  /** S3 client region (defaults to AWS_REGION env) */
  region?: string;
  /** Presigned URL expiration in seconds (default: 3600) */
  presignedUrlExpiration?: number;
}

/**
 * API Gateway Proxy Event (simplified)
 */
export interface APIGatewayProxyEvent {
  httpMethod: string;
  path: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  headers: Record<string, string | undefined>;
  body: string | null;
  isBase64Encoded: boolean;
}

/**
 * API Gateway Proxy Result
 */
export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

/**
 * Lambda Context (simplified)
 */
export interface LambdaContext {
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  logStreamName: string;
  getRemainingTimeInMillis(): number;
}
