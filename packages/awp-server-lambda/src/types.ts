/**
 * AWP Server Lambda - Type Definitions
 */

import type { CasConfig, ServerPortalConfig } from "@agent-web-portal/awp-server-core";

// ============================================================================
// AWS Lambda Types (simplified for compatibility)
// ============================================================================

/**
 * API Gateway Proxy Event
 */
export interface APIGatewayProxyEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string | undefined>;
  queryStringParameters: Record<string, string | undefined> | null;
  body: string | null;
  isBase64Encoded: boolean;
  requestContext: {
    requestId: string;
    stage: string;
    httpMethod: string;
    path: string;
    identity?: {
      sourceIp?: string;
      userAgent?: string;
    };
  };
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
 * Lambda Context
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

/**
 * Lambda Handler Type
 */
export type LambdaHandler = (
  event: APIGatewayProxyEvent,
  context: LambdaContext
) => Promise<APIGatewayProxyResult>;

// ============================================================================
// Builder Configuration Types
// ============================================================================

/**
 * Options for creating a Lambda handler builder
 */
export interface LambdaHandlerBuilderOptions extends Omit<ServerPortalConfig, "cas"> {
  /** Optional: CAS configuration can be set here or via withCasConfig() */
  cas?: CasConfig;
}

/**
 * CAS configuration options for Lambda
 */
export interface LambdaCasConfig extends CasConfig {
  // Additional Lambda-specific CAS options can go here
}

/**
 * Build options for the final handler
 */
export interface LambdaHandlerBuildOptions {
  /**
   * Enable CORS headers in responses
   * @default true
   */
  cors?: boolean;

  /**
   * CORS origin header value
   * @default "*"
   */
  corsOrigin?: string;

  /**
   * Enable request logging
   * @default false
   */
  logging?: boolean;
}

// ============================================================================
// Route Handler Types
// ============================================================================

/**
 * Custom route handler function
 *
 * Return a Response to handle the request, or null to pass to the next handler.
 */
export type LambdaRouteHandler = (
  request: Request,
  event: APIGatewayProxyEvent,
  context: LambdaContext
) => Promise<Response | null>;
