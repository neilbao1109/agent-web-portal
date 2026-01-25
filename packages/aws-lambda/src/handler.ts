/**
 * AWS Lambda Adapter for Agent Web Portal
 *
 * Creates a Lambda handler that routes requests to:
 * - /mcp - MCP endpoint (JSON-RPC)
 * - /skills/:skillName - Skill download endpoint (redirects to S3 presigned URL)
 * - /auth/init - Auth initiation endpoint
 * - /auth/status - Auth status polling endpoint
 */

import { readFileSync } from "node:fs";
import type { AgentWebPortalInstance } from "@agent-web-portal/core";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { parse as parseYaml } from "yaml";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  AwpAuthLambdaConfig,
  LambdaAdapterOptions,
  LambdaAuthRequest,
  LambdaContext,
  SkillsConfig,
} from "./types.ts";

// Default auth paths
const DEFAULT_AUTH_INIT_PATH = "/auth/init";
const DEFAULT_AUTH_STATUS_PATH = "/auth/status";
const DEFAULT_AUTH_PAGE_PATH = "/auth";

/**
 * Create a Lambda handler for Agent Web Portal
 *
 * @param portal - The Agent Web Portal instance
 * @param options - Adapter options
 * @returns Lambda handler function
 *
 * @example
 * ```typescript
 * import { createAgentWebPortal } from "@agent-web-portal/core";
 * import { createLambdaHandler } from "@agent-web-portal/aws-lambda";
 *
 * const portal = createAgentWebPortal({ name: "my-portal" })
 *   .registerTool("greet", { ... })
 *   .build();
 *
 * export const handler = createLambdaHandler(portal, {
 *   skillsConfigPath: "./skills.yaml",
 * });
 * ```
 */
export function createLambdaHandler(
  portal: AgentWebPortalInstance,
  options: LambdaAdapterOptions = {}
): (event: APIGatewayProxyEvent, context: LambdaContext) => Promise<APIGatewayProxyResult> {
  // Load skills config
  let skillsConfig: SkillsConfig | undefined;

  if (options.skillsConfig) {
    skillsConfig = options.skillsConfig;
  } else if (options.skillsConfigPath) {
    const configContent = readFileSync(options.skillsConfigPath, "utf-8");
    skillsConfig = parseYaml(configContent) as SkillsConfig;
  }

  // Create S3 client (lazy initialization)
  let s3Client: S3Client | undefined;

  const getS3Client = () => {
    if (!s3Client) {
      s3Client = new S3Client({
        region: options.region ?? process.env.AWS_REGION ?? "us-east-1",
      });
    }
    return s3Client;
  };

  const presignedUrlExpiration = options.presignedUrlExpiration ?? 3600;
  const authMiddleware = options.authMiddleware;
  const customRoutes = options.customRoutes ?? [];
  const awpAuth = options.awpAuth;

  // Get auth paths
  const authInitPath = awpAuth?.authInitPath ?? DEFAULT_AUTH_INIT_PATH;
  const authStatusPath = awpAuth?.authStatusPath ?? DEFAULT_AUTH_STATUS_PATH;
  const authPagePath = awpAuth?.authPagePath ?? DEFAULT_AUTH_PAGE_PATH;

  return async (
    event: APIGatewayProxyEvent,
    _context: LambdaContext
  ) => {
    const { path, httpMethod } = event;

    try {
      // Handle CORS preflight
      if (httpMethod === "OPTIONS") {
        return {
          statusCode: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, Mcp-Session-Id, X-API-Key, X-AWP-Signature, X-AWP-Pubkey, X-AWP-Timestamp",
          },
          body: "",
        };
      }

      // Build base URL from event
      const protocol = event.headers["x-forwarded-proto"] ?? "https";
      const host = event.headers.host ?? event.headers.Host ?? "localhost";
      const baseUrl = `${protocol}://${host}`;

      // Create a Request-like object for auth middleware and custom routes
      const authRequest = createAuthRequest(event, baseUrl);

      // Try custom routes first (e.g., well-known endpoints)
      for (const routeHandler of customRoutes) {
        const response = await routeHandler(authRequest);
        if (response) {
          return await responseToApiGateway(response);
        }
      }

      // Handle AWP auth endpoints (before auth middleware)
      if (awpAuth) {
        const authResponse = await handleAwpAuthRoutes(path, authRequest, awpAuth, baseUrl);
        if (authResponse) {
          return await responseToApiGateway(authResponse);
        }
      }

      // Run auth middleware if configured
      if (authMiddleware) {
        const authResult = await authMiddleware(authRequest);
        if (!authResult.authorized) {
          // Return the 401 challenge response
          if (authResult.challengeResponse) {
            return await responseToApiGateway(authResult.challengeResponse);
          }
          // Fallback 401
          return {
            statusCode: 401,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Unauthorized" }),
          };
        }
      }

      // Route: /mcp - MCP endpoint
      if (path === "/mcp" || path === "/") {
        return await handleMcpRequest(portal, event);
      }

      // Route: /skills/:skillName - Skill download
      const skillMatch = path.match(/^\/skills\/([^/]+)$/);
      if (skillMatch) {
        const skillName = skillMatch[1]!;
        return await handleSkillDownload(
          skillName,
          skillsConfig,
          getS3Client,
          presignedUrlExpiration
        );
      }

      // 404 Not Found
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Not Found", path }),
      };
    } catch (error) {
      console.error("Lambda handler error:", error);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      };
    }
  };
}

/**
 * Handle AWP auth-related routes
 */
async function handleAwpAuthRoutes(
  path: string,
  request: LambdaAuthRequest,
  config: AwpAuthLambdaConfig,
  baseUrl: string
): Promise<Response | null> {
  const authInitPath = config.authInitPath ?? DEFAULT_AUTH_INIT_PATH;
  const authStatusPath = config.authStatusPath ?? DEFAULT_AUTH_STATUS_PATH;

  // Import auth functions lazily to avoid circular dependencies
  const { handleAuthInit, handleAuthStatus } = await import("@agent-web-portal/auth");

  // Handle /auth/init
  if (path === authInitPath) {
    return handleAuthInit(request, {
      baseUrl,
      pendingAuthStore: config.pendingAuthStore,
      authPagePath: config.authPagePath ?? DEFAULT_AUTH_PAGE_PATH,
      verificationCodeTTL: config.verificationCodeTTL,
    });
  }

  // Handle /auth/status
  if (path === authStatusPath) {
    return handleAuthStatus(request, {
      pubkeyStore: config.pubkeyStore,
      pendingAuthStore: config.pendingAuthStore,
    });
  }

  return null;
}

/**
 * Create a Request-like object from API Gateway event for auth middleware
 */
function createAuthRequest(event: APIGatewayProxyEvent, baseUrl: string): LambdaAuthRequest {
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body
    : "";

  const request: LambdaAuthRequest = {
    method: event.httpMethod,
    url: `${baseUrl}${event.path}`,
    headers: new Headers(event.headers as Record<string, string>),
    text: async () => body,
    clone: () => createAuthRequest(event, baseUrl),
  };

  return request;
}

/**
 * Convert a Response object to API Gateway result
 */
async function responseToApiGateway(response: Response): Promise<APIGatewayProxyResult> {
  const body = await response.text();
  const headers: Record<string, string> = {};

  // Copy headers
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    statusCode: response.status,
    headers,
    body,
  };
}

/**
 * Handle MCP JSON-RPC requests
 */
async function handleMcpRequest(
  portal: AgentWebPortalInstance,
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  // Create a Request-like object for the portal
  const request = {
    method: event.httpMethod,
    headers: new Headers(event.headers as Record<string, string>),
    json: async () => {
      if (!event.body) {
        throw new Error("Empty request body");
      }
      const body = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf-8")
        : event.body;
      return JSON.parse(body);
    },
  };

  // Handle the request using the portal
  const response = await portal.handleRequest(request);

  // Convert Response to API Gateway format
  const responseBody = await response.text();

  return {
    statusCode: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
    body: responseBody,
  };
}

/**
 * Handle skill download requests
 * Returns a presigned S3 URL for the skill zip file
 */
async function handleSkillDownload(
  skillName: string,
  skillsConfig: SkillsConfig | undefined,
  getS3Client: () => S3Client,
  expiresIn: number
): Promise<APIGatewayProxyResult> {
  if (!skillsConfig) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Skills configuration not loaded" }),
    };
  }

  // Find the skill
  const skill = skillsConfig.skills.find((s) => s.name === skillName);
  if (!skill) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Skill not found", skillName }),
    };
  }

  // Generate presigned URL
  const s3Key = skillsConfig.prefix ? `${skillsConfig.prefix}${skill.s3Key}` : skill.s3Key;
  const command = new GetObjectCommand({
    Bucket: skillsConfig.bucket,
    Key: s3Key,
  });

  const presignedUrl = await getSignedUrl(getS3Client(), command, { expiresIn });

  // Redirect to presigned URL
  return {
    statusCode: 302,
    headers: {
      Location: presignedUrl,
      "Cache-Control": "no-cache",
    },
    body: "",
  };
}
