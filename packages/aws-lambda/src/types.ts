/**
 * Type definitions for AWS Lambda adapter
 */

import type { SkillFrontmatter } from "@agent-web-portal/core";

// ============================================================================
// Auth Types
// ============================================================================

/**
 * Auth context from successful AWP authentication
 */
export interface LambdaAuthContext {
  /** The authenticated user's ID */
  userId: string;
  /** The client's public key */
  pubkey: string;
  /** The client name */
  clientName: string;
}

/**
 * Auth middleware result
 */
export interface LambdaAuthResult {
  /** Whether the request is authorized */
  authorized: boolean;
  /** Auth context if authorized */
  context?: LambdaAuthContext;
  /** Challenge response to return if not authorized (401) */
  challengeResponse?: Response;
}

/**
 * Auth middleware function type for Lambda
 *
 * Takes a Request-like object and returns auth result.
 */
export type LambdaAuthMiddleware = (request: LambdaAuthRequest) => Promise<LambdaAuthResult>;

/**
 * Request object passed to auth middleware
 */
export interface LambdaAuthRequest {
  method: string;
  url: string;
  headers: Headers | Record<string, string>;
  text(): Promise<string>;
  clone(): LambdaAuthRequest;
}

/**
 * Route handler function type
 *
 * Returns a Response if handled, null if not handled.
 */
export type LambdaRouteHandler = (request: LambdaAuthRequest) => Response | null | Promise<Response | null>;

// ============================================================================
// AWP Auth Configuration
// ============================================================================

/**
 * AWP Auth configuration for Lambda
 */
export interface AwpAuthLambdaConfig {
  /**
   * Path for auth initiation endpoint
   * @default "/auth/init"
   */
  authInitPath?: string;

  /**
   * Path for auth status polling endpoint
   * @default "/auth/status"
   */
  authStatusPath?: string;

  /**
   * Path for auth page (where user enters verification code)
   * @default "/auth"
   */
  authPagePath?: string;

  /**
   * Store for pending authorizations
   */
  pendingAuthStore: import("@agent-web-portal/auth").PendingAuthStore;

  /**
   * Store for authorized pubkeys
   */
  pubkeyStore: import("@agent-web-portal/auth").PubkeyStore;

  /**
   * TTL for verification codes in seconds
   * @default 600 (10 minutes)
   */
  verificationCodeTTL?: number;

  /**
   * Maximum allowed clock skew for request signatures in seconds
   * @default 300 (5 minutes)
   */
  maxClockSkew?: number;

  /**
   * Paths to exclude from authentication
   */
  excludePaths?: string[];

  /**
   * TTL for authorized pubkeys in seconds
   * @default 2592000 (30 days)
   */
  authorizationTTL?: number;
}

// ============================================================================
// Skill Configuration
// ============================================================================

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

// ============================================================================
// Lambda Adapter Options
// ============================================================================

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
  /** Auth middleware from @agent-web-portal/auth */
  authMiddleware?: LambdaAuthMiddleware;
  /** Custom route handlers (e.g., well-known endpoints) */
  customRoutes?: LambdaRouteHandler[];
  /** AWP Auth configuration (if using built-in AWP auth) */
  awpAuth?: AwpAuthLambdaConfig;
}

// ============================================================================
// API Gateway Types
// ============================================================================

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
