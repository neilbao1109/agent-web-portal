/**
 * Lambda Handler for AWP Examples (SST)
 *
 * Routes requests to multiple portals based on path prefix:
 * - /api/auth/*          -> AWP auth endpoints (init, status, page, complete)
 * - /api/login, logout, me, clients/* -> Session management APIs
 * - /api/blob/*          -> Blob storage APIs (prepare-upload, prepare-download, upload, files)
 * - /api/health          -> Health check
 * - /api/awp/basic       -> Basic greeting portal
 * - /api/awp/ecommerce   -> E-commerce portal
 * - /api/awp/jsonata     -> JSONata portal
 * - /api/awp/blob        -> Blob portal
 * - /api/awp/secure      -> Secure portal (requires AWP auth)
 * - /api/awp/{name}/skills/* -> Per-portal skills
 *
 * This handler is optimized for SAM deployment with CloudFront.
 */

import {
  type AuthHttpRequest,
  type AuthorizedPubkey,
  completeAuthorization,
  createAwpAuthMiddleware,
  routeAuthRequest,
} from "@agent-web-portal/auth";
import {
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
  DynamoDBPendingAuthStore,
  DynamoDBPubkeyStore,
  type LambdaContext,
} from "@agent-web-portal/aws-lambda";
import {
  createClearSessionCookie,
  createSession,
  createSessionCookie,
  deleteSession,
  getSession,
  getSessionIdFromCookie,
  initSessionStore,
  validateCredentials,
} from "./auth/dynamodb-session.ts";
import { getAuthPageHtml, getAuthSuccessHtml } from "./auth/ui.ts";
import {
  createOutputBlobSlotS3,
  getImagePresignedUrlS3,
  getTempUploadS3,
  isS3BlobStorageConfigured,
  listStoredImagesS3,
  readOutputBlobS3,
  storeImageS3,
  storeTempUploadS3,
} from "./portals/blob-s3.ts";
import {
  authPortal,
  basicPortal,
  blobPortal,
  ecommercePortal,
  imageWorkshopPortal,
  jsonataPortal,
} from "./portals/index.ts";
import { serveStaticAssets } from "./static.ts";

// =============================================================================
// Configuration
// =============================================================================

const AUTH_TABLE = process.env.AUTH_TABLE ?? "awp-examples-sst-auth";
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";

// Built-in test users
const TEST_USERS: Record<string, { password: string; userId: string }> = {
  test: { password: "test123", userId: "test-user-001" },
  admin: { password: "admin123", userId: "admin-user-001" },
  demo: { password: "demo", userId: "demo-user-001" },
};

/**
 * Create S3Client with LocalStack support
 * Reads env vars at call time to ensure they're available
 */
async function createS3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");

  // Read S3_ENDPOINT at call time (not module load time)
  const s3Endpoint = process.env.S3_ENDPOINT ?? "";

  // Support LocalStack/MinIO for local development
  if (s3Endpoint) {
    console.log(`[S3] Using LocalStack endpoint: ${s3Endpoint}`);
    return new S3Client({
      region: AWS_REGION,
      endpoint: s3Endpoint,
      forcePathStyle: true, // Required for LocalStack/MinIO
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
      },
    });
  }

  console.log("[S3] Using default AWS S3");
  return new S3Client({ region: AWS_REGION });
}

/**
 * Create S3Client for generating presigned URLs that clients can access
 * Uses S3_PUBLIC_ENDPOINT (localhost) instead of S3_ENDPOINT (host.docker.internal)
 */
async function createS3ClientForPresignedUrls() {
  const { S3Client } = await import("@aws-sdk/client-s3");

  // S3_PUBLIC_ENDPOINT is the endpoint accessible from client machines (e.g., localhost:4566)
  // S3_ENDPOINT is the endpoint accessible from Lambda container (e.g., host.docker.internal:4566)
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT ?? "";

  if (publicEndpoint) {
    console.log(`[S3] Using public endpoint for presigned URLs: ${publicEndpoint}`);
    return new S3Client({
      region: AWS_REGION,
      endpoint: publicEndpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
      },
    });
  }

  // Fall back to regular S3 client
  return createS3Client();
}

// =============================================================================
// Auth Stores
// =============================================================================

const pendingAuthStore = new DynamoDBPendingAuthStore({
  tableName: AUTH_TABLE,
  region: AWS_REGION,
});

const pubkeyStore = new DynamoDBPubkeyStore({
  tableName: AUTH_TABLE,
  region: AWS_REGION,
  userIdIndexName: "userId-createdAt-index",
});

// Initialize session store
initSessionStore({
  tableName: AUTH_TABLE,
  region: AWS_REGION,
});

// Auth middleware
const authMiddleware = createAwpAuthMiddleware({
  pendingAuthStore,
  pubkeyStore,
  authInitPath: "/api/auth/init",
  authStatusPath: "/api/auth/status",
  authPagePath: "/api/auth/page",
});

// =============================================================================
// Request Conversion Helpers
// =============================================================================

function createAuthRequest(event: APIGatewayProxyEvent, baseUrl: string): AuthHttpRequest {
  // API Gateway v2 (HTTP API) uses different event structure
  const eventV2 = event as unknown as {
    rawPath?: string;
    rawQueryString?: string;
    requestContext?: { http?: { method?: string } };
  };
  const path = event.path ?? eventV2.rawPath ?? "/";
  const method = event.httpMethod ?? eventV2.requestContext?.http?.method ?? "GET";

  // Build query string - API Gateway v2 uses rawQueryString
  let queryString = "";
  if (eventV2.rawQueryString) {
    queryString = `?${eventV2.rawQueryString}`;
  } else if (event.queryStringParameters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value) params.append(key, value);
    }
    const qs = params.toString();
    if (qs) queryString = `?${qs}`;
  }

  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body
    : "";

  const headers = new Headers(event.headers as Record<string, string>);

  // For auth request URL, use protocol://host without stage path
  // The baseUrl with stage is only for generating redirect URLs, not for path matching
  const protocol = event.headers["x-forwarded-proto"] ?? "https";
  const host = event.headers.host ?? event.headers.Host ?? "localhost";
  const authRequestBaseUrl = `${protocol}://${host}`;

  const request: AuthHttpRequest = {
    method,
    url: `${authRequestBaseUrl}${path}${queryString}`,
    headers,
    text: async () => body,
    clone: () => createAuthRequest(event, baseUrl),
  };

  return request;
}

function createWebRequest(event: APIGatewayProxyEvent, baseUrl: string): Request {
  // API Gateway v2 (HTTP API) uses different event structure
  const eventV2 = event as unknown as {
    rawPath?: string;
    requestContext?: { http?: { method?: string } };
  };
  const path = event.path ?? eventV2.rawPath ?? "/";
  const method = event.httpMethod ?? eventV2.requestContext?.http?.method ?? "GET";

  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body
    : undefined;

  const headers = new Headers(event.headers as Record<string, string>);
  const url = `${baseUrl}${path}`;

  return new Request(url, {
    method,
    headers,
    body: method !== "GET" && method !== "HEAD" ? body : undefined,
  });
}

async function responseToApiGateway(response: Response): Promise<APIGatewayProxyResult> {
  const body = await response.text();
  const headers: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    statusCode: response.status,
    headers,
    body,
  };
}

// =============================================================================
// Skills Manifest Helper (reads from S3 skills/{portal}/skills-manifest.json)
// =============================================================================

async function getSkillsManifestFromS3(portalName: string): Promise<Record<string, unknown>> {
  const bucketName = process.env.SKILLS_BUCKET || process.env.BLOB_BUCKET;
  if (!bucketName) {
    return {};
  }

  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await createS3Client();

    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `skills/${portalName}/skills-manifest.json`,
      })
    );

    if (!response.Body) {
      return {};
    }

    const content = await response.Body.transformToString();
    const skills = JSON.parse(content) as Array<{
      id: string;
      url: string;
      frontmatter: Record<string, unknown>;
    }>;

    // Convert array to object format for MCP skills/list response
    const result: Record<string, unknown> = {};
    for (const skill of skills) {
      result[skill.id] = {
        url: skill.url,
        frontmatter: skill.frontmatter,
      };
    }
    return result;
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") {
      return {};
    }
    console.error("Failed to get skills manifest from S3:", error);
    return {};
  }
}

/**
 * Handle portal MCP request with skills/list interception
 * Intercepts skills/list to return skills from S3 manifest
 */
async function handlePortalMcpRequest(
  event: APIGatewayProxyEvent,
  portal: { handleRequest: (req: Request) => Promise<Response> },
  portalName: string,
  baseUrl: string,
  corsHeaders: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const httpMethod =
    event.httpMethod ??
    (event as unknown as { requestContext?: { http?: { method?: string } } }).requestContext?.http
      ?.method ??
    "GET";

  // Check if this is a skills/list request
  if (httpMethod === "POST" && event.body) {
    try {
      const body = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf-8")
        : event.body;
      const jsonBody = JSON.parse(body);

      if (jsonBody && typeof jsonBody === "object" && jsonBody.method === "skills/list") {
        // Return skills from S3 manifest
        const skills = await getSkillsManifestFromS3(portalName);
        return {
          statusCode: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: jsonBody.id,
            result: skills,
          }),
        };
      }
    } catch {
      // Not JSON or parsing failed, continue to portal handler
    }
  }

  // Forward to portal handler for all other requests
  const req = createWebRequest(event, baseUrl);
  const res = await portal.handleRequest(req);
  return responseToApiGateway(res);
}

// =============================================================================
// Form Data Parser
// =============================================================================

function parseFormData(body: string, contentType: string): Record<string, string> {
  const result: Record<string, string> = {};

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body);
    for (const [key, value] of params) {
      result[key] = value;
    }
  } else if (contentType.includes("multipart/form-data")) {
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1]!;
      const parts = body.split(`--${boundary}`);
      for (const part of parts) {
        const nameMatch = part.match(/name="([^"]+)"/);
        if (nameMatch) {
          const name = nameMatch[1]!;
          const valueMatch = part.split("\r\n\r\n")[1];
          if (valueMatch) {
            result[name] = valueMatch.replace(/\r\n--$/, "").trim();
          }
        }
      }
    }
  }

  return result;
}

// =============================================================================
// Lambda Handler
// =============================================================================

export async function handler(
  event: APIGatewayProxyEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResult> {
  // API Gateway v2 (HTTP API) uses rawPath, v1 (REST API) uses path
  const path = event.path ?? (event as unknown as { rawPath?: string }).rawPath ?? "/";
  const httpMethod =
    event.httpMethod ??
    (event as unknown as { requestContext?: { http?: { method?: string } } }).requestContext?.http
      ?.method ??
    "GET";

  // Build base URL
  const protocol = event.headers["x-forwarded-proto"] ?? "https";
  const host = event.headers.host ?? event.headers.Host ?? "localhost";
  const stage = (event as { requestContext?: { stage?: string } }).requestContext?.stage;

  // Detect if request came through CloudFront by checking for CloudFront headers
  // CloudFront adds these headers when forwarding requests
  const cloudFrontId = event.headers["x-amz-cf-id"] ?? event.headers["X-Amz-Cf-Id"];
  const isViaCloudFront = !!cloudFrontId;

  // If accessing through API Gateway directly (not CloudFront), include the stage
  const isApiGatewayDirect =
    !isViaCloudFront && host.includes("execute-api.") && stage && stage !== "$default";

  // For CloudFront, use the known CloudFront domain
  const cloudFrontDomain = "d2gky9zm1ughki.cloudfront.net";
  const baseUrl = isViaCloudFront
    ? `${protocol}://${cloudFrontDomain}`
    : isApiGatewayDirect
      ? `${protocol}://${host}/${stage}`
      : `${protocol}://${host}`;

  // Get origin for CORS - must be explicit origin when using credentials
  const requestOrigin = event.headers.origin ?? event.headers.Origin;
  // Allowed origins for CORS with credentials
  const allowedOrigins = [
    "https://d2gky9zm1ughki.cloudfront.net",
    "http://localhost:5173",
    "http://localhost:3000",
  ] as const;
  const defaultOrigin = allowedOrigins[0];
  const origin =
    requestOrigin && allowedOrigins.includes(requestOrigin as (typeof allowedOrigins)[number])
      ? requestOrigin
      : defaultOrigin;

  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Mcp-Session-Id, X-AWP-Signature, X-AWP-Pubkey, X-AWP-Timestamp",
    "Access-Control-Allow-Credentials": "true",
  };

  try {
    // Handle CORS preflight
    if (httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: corsHeaders,
        body: "",
      };
    }

    // Health check - /api/health
    if (path === "/api/health") {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          deployment: "sam",
        }),
      };
    }

    // =========================================================================
    // Auth API Endpoints - /api/auth/*
    // =========================================================================

    // GET /api/auth/me - Get current user
    if (path === "/api/auth/me" && httpMethod === "GET") {
      const cookieHeader = event.headers.cookie ?? event.headers.Cookie ?? null;
      const sessionId = getSessionIdFromCookie(cookieHeader);

      if (!sessionId) {
        return {
          statusCode: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ authenticated: false }),
        };
      }

      const session = await getSession(sessionId);
      if (!session) {
        return {
          statusCode: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Set-Cookie": createClearSessionCookie(),
          },
          body: JSON.stringify({ authenticated: false }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          authenticated: true,
          user: {
            userId: session.userId,
            username: session.username,
          },
        }),
      };
    }

    // POST /api/auth/login - Login with username/password
    if (path === "/api/auth/login" && httpMethod === "POST") {
      const body = event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64").toString("utf-8")
          : event.body
        : "{}";

      let credentials: { username?: string; password?: string };
      try {
        credentials = JSON.parse(body);
      } catch {
        credentials = {};
      }

      const { username = "", password = "" } = credentials;
      const user = validateCredentials(username, password);

      if (!user) {
        return {
          statusCode: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Invalid username or password" }),
        };
      }

      const { sessionId, session } = await createSession(user);

      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Set-Cookie": createSessionCookie(sessionId),
        },
        body: JSON.stringify({
          success: true,
          user: {
            userId: session.userId,
            username: session.username,
          },
        }),
      };
    }

    // POST /api/auth/logout - Logout
    if (path === "/api/auth/logout" && httpMethod === "POST") {
      const cookieHeader = event.headers.cookie ?? event.headers.Cookie ?? null;
      const sessionId = getSessionIdFromCookie(cookieHeader);

      if (sessionId) {
        await deleteSession(sessionId);
      }

      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Set-Cookie": createClearSessionCookie(),
        },
        body: JSON.stringify({ success: true }),
      };
    }

    // GET /api/auth/clients - List authorized clients for current user
    if (path === "/api/auth/clients" && httpMethod === "GET") {
      const cookieHeader = event.headers.cookie ?? event.headers.Cookie ?? null;
      const sessionId = getSessionIdFromCookie(cookieHeader);

      if (!sessionId) {
        return {
          statusCode: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Unauthorized" }),
        };
      }

      const session = await getSession(sessionId);
      if (!session) {
        return {
          statusCode: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Set-Cookie": createClearSessionCookie(),
          },
          body: JSON.stringify({ error: "Unauthorized" }),
        };
      }

      const clients = await pubkeyStore.listByUser(session.userId);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          clients: clients.map((c: AuthorizedPubkey) => ({
            pubkey: c.pubkey,
            clientName: c.clientName,
            createdAt: c.createdAt,
            expiresAt: c.expiresAt,
          })),
        }),
      };
    }

    // DELETE /api/auth/clients/:pubkey - Revoke a client authorization
    if (path.startsWith("/api/auth/clients/") && httpMethod === "DELETE") {
      const cookieHeader = event.headers.cookie ?? event.headers.Cookie ?? null;
      const sessionId = getSessionIdFromCookie(cookieHeader);

      if (!sessionId) {
        return {
          statusCode: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Unauthorized" }),
        };
      }

      const session = await getSession(sessionId);
      if (!session) {
        return {
          statusCode: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Unauthorized" }),
        };
      }

      const pubkeyEncoded = path.slice("/api/auth/clients/".length);
      const pubkey = decodeURIComponent(pubkeyEncoded);

      const authInfo = await pubkeyStore.lookup(pubkey);
      if (!authInfo || authInfo.userId !== session.userId) {
        return {
          statusCode: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Client not found" }),
        };
      }

      await pubkeyStore.revoke(pubkey);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ success: true }),
      };
    }

    // PATCH /api/auth/clients/:pubkey - Renew a client authorization
    if (path.startsWith("/api/auth/clients/") && httpMethod === "PATCH") {
      const cookieHeader = event.headers.cookie ?? event.headers.Cookie ?? null;
      const sessionId = getSessionIdFromCookie(cookieHeader);

      if (!sessionId) {
        return {
          statusCode: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Unauthorized" }),
        };
      }

      const session = await getSession(sessionId);
      if (!session) {
        return {
          statusCode: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Unauthorized" }),
        };
      }

      const pubkeyEncoded = path.slice("/api/auth/clients/".length);
      const pubkey = decodeURIComponent(pubkeyEncoded);

      const authInfo = await pubkeyStore.lookup(pubkey);
      if (!authInfo || authInfo.userId !== session.userId) {
        return {
          statusCode: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Client not found" }),
        };
      }

      const body = event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64").toString("utf-8")
          : event.body
        : "{}";

      let payload: { expiresIn?: number };
      try {
        payload = JSON.parse(body);
      } catch {
        payload = {};
      }

      const newExpiresAt = payload.expiresIn ? Date.now() + payload.expiresIn * 1000 : undefined;
      const updatedAuth: AuthorizedPubkey = {
        ...authInfo,
        expiresAt: newExpiresAt,
      };
      await pubkeyStore.store(updatedAuth);

      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          client: {
            pubkey: updatedAuth.pubkey,
            clientName: updatedAuth.clientName,
            createdAt: updatedAuth.createdAt,
            expiresAt: updatedAuth.expiresAt,
          },
        }),
      };
    }

    // Static UI assets
    if (path.startsWith("/ui") || path === "/" || path === "/index.html") {
      return serveStaticAssets(event, path);
    }

    // =========================================================================
    // Portal MCP Endpoints - /api/awp/*
    // =========================================================================

    // Basic portal - /api/awp/basic
    if (path === "/api/awp/basic" || path === "/api/awp/basic/mcp") {
      return handlePortalMcpRequest(event, basicPortal, "basic", baseUrl, corsHeaders);
    }

    // E-commerce portal - /api/awp/ecommerce
    if (path === "/api/awp/ecommerce" || path === "/api/awp/ecommerce/mcp") {
      return handlePortalMcpRequest(event, ecommercePortal, "ecommerce", baseUrl, corsHeaders);
    }

    // JSONata portal - /api/awp/jsonata
    if (path === "/api/awp/jsonata" || path === "/api/awp/jsonata/mcp") {
      return handlePortalMcpRequest(event, jsonataPortal, "jsonata", baseUrl, corsHeaders);
    }

    // Blob portal MCP endpoint - /api/awp/blob
    if (path === "/api/awp/blob" || path === "/api/awp/blob/mcp") {
      return handlePortalMcpRequest(event, blobPortal, "blob", baseUrl, corsHeaders);
    }

    // Image Workshop portal - /api/awp/image-workshop
    if (path === "/api/awp/image-workshop" || path === "/api/awp/image-workshop/mcp") {
      return handlePortalMcpRequest(
        event,
        imageWorkshopPortal,
        "image-workshop",
        baseUrl,
        corsHeaders
      );
    }

    // =========================================================================
    // Blob Storage API Routes - /api/blob/*
    // =========================================================================

    // Prepare upload - upload file and get presigned GET URL (5 min TTL)
    if (path === "/api/blob/prepare-upload" && httpMethod === "POST") {
      if (!isS3BlobStorageConfigured()) {
        return {
          statusCode: 503,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Blob storage not configured" }),
        };
      }

      try {
        const contentType = event.headers["content-type"] ?? event.headers["Content-Type"] ?? "";
        const body = event.body
          ? event.isBase64Encoded
            ? Buffer.from(event.body, "base64")
            : Buffer.from(event.body)
          : Buffer.alloc(0);

        // For multipart, we need to parse the form data using Buffer operations
        // to avoid corrupting binary data
        if (contentType.includes("multipart/form-data")) {
          const boundary = contentType.match(/boundary=(.+)/)?.[1];
          if (boundary) {
            const boundaryBuffer = Buffer.from(`--${boundary}`);

            // Find all boundary positions
            const boundaryPositions: number[] = [];
            let searchStart = 0;
            while (true) {
              const pos = body.indexOf(boundaryBuffer, searchStart);
              if (pos === -1) break;
              boundaryPositions.push(pos);
              searchStart = pos + boundaryBuffer.length;
            }

            // Process each part
            for (let i = 0; i < boundaryPositions.length - 1; i++) {
              const startPos = boundaryPositions[i];
              const endPos = boundaryPositions[i + 1];
              if (startPos === undefined || endPos === undefined) continue;
              const partStart = startPos + boundaryBuffer.length;
              const partEnd = endPos;
              const partBuffer = body.subarray(partStart, partEnd);

              // Find header end (double CRLF)
              const headerEndMarker = Buffer.from("\r\n\r\n");
              const headerEnd = partBuffer.indexOf(headerEndMarker);
              if (headerEnd === -1) continue;

              // Extract header as string (headers are ASCII-safe)
              const headerBuffer = partBuffer.subarray(0, headerEnd);
              const headerStr = headerBuffer.toString("utf-8");

              // Check if this is the image part
              if (!headerStr.includes('name="image"')) continue;

              // Extract file data (pure binary, no string conversion)
              let fileData = partBuffer.subarray(headerEnd + 4);

              // Remove trailing CRLF if present
              if (
                fileData.length >= 2 &&
                fileData[fileData.length - 2] === 0x0d &&
                fileData[fileData.length - 1] === 0x0a
              ) {
                fileData = fileData.subarray(0, fileData.length - 2);
              }

              // Extract content type from header
              const partContentType =
                headerStr.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] ?? "image/png";

              const result = await storeTempUploadS3(
                fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.length),
                partContentType
              );
              return {
                statusCode: 200,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
                body: JSON.stringify(result),
              };
            }
          }
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "No image file found in request" }),
          };
        }

        // Raw binary upload
        const imageContentType = contentType.startsWith("image/") ? contentType : "image/png";
        const result = await storeTempUploadS3(body.buffer as ArrayBuffer, imageContentType);
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify(result),
        };
      } catch (error) {
        console.error("prepare-upload error:", error);
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Failed to prepare upload" }),
        };
      }
    }

    // Get temporary upload
    if (path.startsWith("/api/blob/temp/") && httpMethod === "GET") {
      const id = decodeURIComponent(path.slice("/api/blob/temp/".length));
      const upload = await getTempUploadS3(id);

      if (!upload) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Temporary upload not found or expired" }),
        };
      }

      return {
        statusCode: 200,
        headers: {
          "Content-Type": upload.contentType,
          "Access-Control-Allow-Origin": "*",
        },
        body: Buffer.from(upload.data).toString("base64"),
        isBase64Encoded: true,
      };
    }

    // Prepare download - create output blob slot with presigned URLs
    if (path === "/api/blob/prepare-download" && httpMethod === "POST") {
      if (!isS3BlobStorageConfigured()) {
        return {
          statusCode: 503,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Blob storage not configured" }),
        };
      }

      const result = await createOutputBlobSlotS3();
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(result),
      };
    }

    // Read output blob
    if (path.startsWith("/api/blob/output/") && httpMethod === "GET") {
      const id = decodeURIComponent(path.slice("/api/blob/output/".length));
      const blob = await readOutputBlobS3(id);

      if (!blob) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Output blob not found or expired" }),
        };
      }

      return {
        statusCode: 200,
        headers: {
          "Content-Type": blob.contentType,
          "Access-Control-Allow-Origin": "*",
        },
        body: Buffer.from(blob.data).toString("base64"),
        isBase64Encoded: true,
      };
    }

    // Direct upload to permanent storage
    if (path === "/api/blob/upload" && httpMethod === "POST") {
      if (!isS3BlobStorageConfigured()) {
        return {
          statusCode: 503,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Blob storage not configured" }),
        };
      }

      try {
        const contentType = event.headers["content-type"] ?? event.headers["Content-Type"] ?? "";
        const body = event.body
          ? event.isBase64Encoded
            ? Buffer.from(event.body, "base64")
            : Buffer.from(event.body)
          : Buffer.alloc(0);

        const imageContentType = contentType.startsWith("image/") ? contentType : "image/png";
        const result = await storeImageS3(body.buffer as ArrayBuffer, imageContentType);
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify(result),
        };
      } catch (error) {
        console.error("upload error:", error);
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Failed to upload image" }),
        };
      }
    }

    // Download image from permanent storage (redirect to presigned URL)
    if (path.startsWith("/api/blob/files/") && httpMethod === "GET") {
      const key = decodeURIComponent(path.slice("/api/blob/files/".length));
      const presignedUrl = await getImagePresignedUrlS3(key);

      if (!presignedUrl) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Image not found" }),
        };
      }

      return {
        statusCode: 302,
        headers: {
          Location: presignedUrl,
          "Access-Control-Allow-Origin": "*",
        },
        body: "",
      };
    }

    // List images in permanent storage
    if (path === "/api/blob/files" && httpMethod === "GET") {
      if (!isS3BlobStorageConfigured()) {
        return {
          statusCode: 503,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Blob storage not configured" }),
        };
      }

      const images = await listStoredImagesS3();
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ images, count: images.length }),
      };
    }

    // =========================================================================
    // AWP Auth Flow Routes - /api/auth/*
    // =========================================================================

    if (path.startsWith("/api/auth")) {
      const authReq = createAuthRequest(event, baseUrl);

      // When accessing through API Gateway directly (not via CloudFront), auth page path needs stage prefix
      const authPagePathWithStage = isApiGatewayDirect
        ? `/${stage}/api/auth/page`
        : "/api/auth/page";

      // Handle AWP auth endpoints (/api/auth/init, /api/auth/status)
      const authRouteResponse = await routeAuthRequest(authReq, {
        baseUrl,
        pendingAuthStore,
        pubkeyStore,
        authInitPath: "/api/auth/init",
        authStatusPath: "/api/auth/status",
        authPagePath: authPagePathWithStage,
      });
      if (authRouteResponse) {
        return responseToApiGateway(authRouteResponse);
      }

      // Auth page - login UI
      if (path === "/api/auth/page") {
        // Get pubkey from query string to show client info
        const queryString = event.queryStringParameters ?? {};
        const pubkey = queryString.pubkey ?? "";

        let clientName: string | undefined;
        let verificationCode: string | undefined;

        if (pubkey) {
          // Look up pending auth to get client name and verification code
          const pendingAuth = await pendingAuthStore.get(pubkey);
          if (pendingAuth) {
            clientName = pendingAuth.clientName;
            verificationCode = pendingAuth.verificationCode;
          }
        }

        return {
          statusCode: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
          body: getAuthPageHtml(undefined, clientName, verificationCode),
        };
      }

      // Handle auth complete (JSON API from auth page)
      if (path === "/api/auth/complete" && httpMethod === "POST") {
        const body = event.body
          ? event.isBase64Encoded
            ? Buffer.from(event.body, "base64").toString("utf-8")
            : event.body
          : "{}";

        let payload: { pubkey?: string; verification_code?: string; expires_in?: number };
        try {
          payload = JSON.parse(body);
        } catch {
          payload = {};
        }

        const { pubkey = "", verification_code = "" } = payload;

        if (!pubkey || !verification_code) {
          return {
            statusCode: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "invalid_request",
              error_description: "Missing pubkey or verification_code",
            }),
          };
        }

        // Look up pending auth to get user ID (the UI auth page doesn't require login,
        // but in production you would verify the session here)
        // For demo purposes, we'll use a default user ID
        const pendingAuth = await pendingAuthStore.get(pubkey);
        if (!pendingAuth) {
          return {
            statusCode: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "invalid_request",
              error_description: "No pending authorization found",
            }),
          };
        }

        // Verify the verification code matches
        if (pendingAuth.verificationCode !== verification_code) {
          return {
            statusCode: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "invalid_request",
              error_description: "Invalid verification code",
            }),
          };
        }

        // For demo, use a default user ID (in production, get from session)
        const userId = "demo-user-001";

        // Complete authorization
        const result = await completeAuthorization(pubkey, verification_code, userId, {
          pendingAuthStore,
          pubkeyStore,
        });

        if (result.success) {
          return {
            statusCode: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ success: true }),
          };
        }

        return {
          statusCode: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "authorization_failed",
            error_description: result.errorDescription ?? "Authorization failed",
          }),
        };
      }

      // Auth success page
      if (path === "/api/auth/success") {
        return {
          statusCode: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
          body: getAuthSuccessHtml(),
        };
      }

      // Handle login form submission (legacy path, now handled by /api/auth/login)
      // This is kept for AWP auth page form submission during the auth flow
      if (path === "/api/auth/form-login" && httpMethod === "POST") {
        const contentType = event.headers["content-type"] ?? event.headers["Content-Type"] ?? "";
        const body = event.body
          ? event.isBase64Encoded
            ? Buffer.from(event.body, "base64").toString("utf-8")
            : event.body
          : "";

        const formData = parseFormData(body, contentType);
        const username = formData.username ?? "";
        const password = formData.password ?? "";
        const verificationCode = formData.verification_code ?? "";
        const pubkey = formData.pubkey ?? "";

        const user = TEST_USERS[username];
        if (!user || user.password !== password) {
          return {
            statusCode: 401,
            headers: { "Content-Type": "text/html; charset=utf-8" },
            body: getAuthPageHtml("Invalid username or password"),
          };
        }

        // Complete authorization
        const result = await completeAuthorization(pubkey, verificationCode, user.userId, {
          pendingAuthStore,
          pubkeyStore,
        });

        if (result.success) {
          return {
            statusCode: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
            body: getAuthSuccessHtml(),
          };
        }

        return {
          statusCode: 400,
          headers: { "Content-Type": "text/html; charset=utf-8" },
          body: getAuthPageHtml(result.errorDescription ?? "Authorization failed"),
        };
      }
    }

    // =========================================================================
    // Secure Portal MCP Endpoint - /api/awp/secure (requires AWP auth)
    // =========================================================================

    if (path === "/api/awp/secure" || path === "/api/awp/secure/mcp") {
      const authReq = createAuthRequest(event, baseUrl);
      const authResult = await authMiddleware(authReq);
      if (!authResult.authorized) {
        if (authResult.challengeResponse) {
          return responseToApiGateway(authResult.challengeResponse);
        }
        return {
          statusCode: 401,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Unauthorized" }),
        };
      }

      return handlePortalMcpRequest(event, authPortal, "secure", baseUrl, corsHeaders);
    }

    // Root API route - show available portals
    if (path === "/api" || path === "/api/") {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Agent Web Portal - Examples",
          version: "0.2.0",
          deployment: "sam",
          portals: {
            basic: { endpoint: "/api/awp/basic", description: "Basic greeting portal" },
            ecommerce: { endpoint: "/api/awp/ecommerce", description: "E-commerce portal" },
            jsonata: { endpoint: "/api/awp/jsonata", description: "JSONata expression portal" },
            blob: { endpoint: "/api/awp/blob", description: "Blob portal" },
            secure: {
              endpoint: "/api/awp/secure",
              description: "Secure portal (requires AWP auth)",
            },
          },
          auth: {
            init: "/api/auth/init",
            status: "/api/auth/status",
            page: "/api/auth/page",
            login: "/api/login",
            logout: "/api/logout",
            me: "/api/me",
            clients: "/api/clients",
          },
          blob: {
            upload: "/api/blob/upload",
            files: "/api/blob/files",
            prepareUpload: "/api/blob/prepare-upload",
            prepareDownload: "/api/blob/prepare-download",
          },
          health: "/api/health",
        }),
      };
    }

    // =========================================================================
    // Per-Portal Skills API - /api/awp/{portal}/skills/*
    // =========================================================================

    // Match /api/awp/{portal}/skills or /api/awp/{portal}/skills/{skillName}
    const portalSkillsMatch = path.match(/^\/api\/awp\/([^/]+)\/skills(?:\/(.*))?$/);
    if (portalSkillsMatch) {
      const portalName = portalSkillsMatch[1];
      const skillPath = portalSkillsMatch[2]; // Could be undefined, a skill name, or "skillName/download"

      const bucketName = process.env.SKILLS_BUCKET || process.env.BLOB_BUCKET;
      if (!bucketName) {
        return {
          statusCode: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Skills bucket not configured" }),
        };
      }

      // GET /portals/{portal}/skills - List skills for this portal
      if (!skillPath && httpMethod === "GET") {
        try {
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const s3 = await createS3Client();

          try {
            const response = await s3.send(
              new GetObjectCommand({
                Bucket: bucketName,
                Key: `skills/${portalName}/skills-manifest.json`,
              })
            );

            if (!response.Body) {
              return {
                statusCode: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                body: JSON.stringify([]),
              };
            }

            const manifestContent = await response.Body.transformToString();
            return {
              statusCode: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              body: manifestContent,
            };
          } catch (s3Error: unknown) {
            if ((s3Error as { name?: string }).name === "NoSuchKey") {
              return {
                statusCode: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                body: JSON.stringify([]),
              };
            }
            throw s3Error;
          }
        } catch (error) {
          console.error("Portal skills list error:", error);
          return {
            statusCode: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Failed to list skills" }),
          };
        }
      }

      // GET /api/awp/{portal}/skills/{skillName}.zip - Download skill (redirect to S3 presigned URL)
      if (skillPath?.endsWith(".zip") && httpMethod === "GET") {
        const skillName = skillPath.slice(0, -".zip".length);

        try {
          const { GetObjectCommand, HeadObjectCommand } = await import(
            "@aws-sdk/client-s3"
          );
          const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
          const s3 = await createS3Client();
          const key = `skills/${portalName}/${skillName}.zip`;

          // Check if skill exists
          try {
            await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
          } catch (s3Error: unknown) {
            if ((s3Error as { name?: string }).name === "NotFound") {
              return {
                statusCode: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                body: JSON.stringify({
                  error: "Skill not found",
                  skill: skillName,
                  portal: portalName,
                }),
              };
            }
            throw s3Error;
          }

          // Use public endpoint client for presigned URLs (localhost instead of host.docker.internal)
          const s3ForPresign = await createS3ClientForPresignedUrls();

          // Generate presigned URL and redirect
          const presignedUrl = await getSignedUrl(
            s3ForPresign,
            new GetObjectCommand({
              Bucket: bucketName,
              Key: key,
              ResponseContentDisposition: `attachment; filename="${skillName}.zip"`,
            }),
            { expiresIn: 300 } // 5 minutes
          );

          return {
            statusCode: 302,
            headers: {
              ...corsHeaders,
              Location: presignedUrl,
            },
            body: "",
          };
        } catch (error) {
          console.error("Portal skill download error:", error);
          return {
            statusCode: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Failed to download skill" }),
          };
        }
      }
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
}
