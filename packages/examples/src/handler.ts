/**
 * Lambda Handler for Examples Portal
 *
 * Routes requests to multiple portals based on path prefix:
 * - /basic/*     -> Basic greeting portal
 * - /ecommerce/* -> E-commerce portal
 * - /jsonata/*   -> JSONata portal
 * - /auth/*      -> Auth-enabled portal
 * - /blob/*      -> Blob portal
 * - /ui/*        -> Static UI assets
 */

import {
  type AuthHttpRequest,
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
  jsonataPortal,
} from "./portals/index.ts";
import { serveStaticAssets } from "./static.ts";

// =============================================================================
// Configuration
// =============================================================================

const AUTH_TABLE = process.env.AUTH_TABLE ?? "awp-examples-auth";
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";

// Built-in test users
const TEST_USERS: Record<string, { password: string; userId: string }> = {
  test: { password: "test123", userId: "test-user-001" },
  admin: { password: "admin123", userId: "admin-user-001" },
  demo: { password: "demo", userId: "demo-user-001" },
};

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
});

// Auth middleware
const authMiddleware = createAwpAuthMiddleware({
  pendingAuthStore,
  pubkeyStore,
  authInitPath: "/auth/init",
  authStatusPath: "/auth/status",
  authPagePath: "/auth/page",
});

// =============================================================================
// Request Conversion Helpers
// =============================================================================

function createAuthRequest(event: APIGatewayProxyEvent, baseUrl: string): AuthHttpRequest {
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body
    : "";

  const headers = new Headers(event.headers as Record<string, string>);

  const request: AuthHttpRequest = {
    method: event.httpMethod,
    url: `${baseUrl}${event.path}`,
    headers,
    text: async () => body,
    clone: () => createAuthRequest(event, baseUrl),
  };

  return request;
}

function createWebRequest(event: APIGatewayProxyEvent, baseUrl: string): Request {
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body
    : undefined;

  const headers = new Headers(event.headers as Record<string, string>);
  const url = `${baseUrl}${event.path}`;

  return new Request(url, {
    method: event.httpMethod,
    headers,
    body: event.httpMethod !== "GET" && event.httpMethod !== "HEAD" ? body : undefined,
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
    // Simple multipart parser - extract boundary and parse
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
  const { path, httpMethod } = event;

  // Build base URL
  const protocol = event.headers["x-forwarded-proto"] ?? "https";
  const host = event.headers.host ?? event.headers.Host ?? "localhost";
  const baseUrl = `${protocol}://${host}`;

  try {
    // Handle CORS preflight
    if (httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, Mcp-Session-Id, X-AWP-Signature, X-AWP-Pubkey, X-AWP-Timestamp",
        },
        body: "",
      };
    }

    // Health check
    if (path === "/health" || path === "/healthz" || path === "/ping") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
      };
    }

    // Static UI assets
    if (path.startsWith("/ui") || path === "/" || path === "/index.html") {
      return serveStaticAssets(event, path);
    }

    // Basic portal
    if (path === "/basic" || path === "/basic/mcp") {
      const req = createWebRequest(event, baseUrl);
      const res = await basicPortal.handleRequest(req);
      return responseToApiGateway(res);
    }

    // E-commerce portal
    if (path === "/ecommerce" || path === "/ecommerce/mcp") {
      const req = createWebRequest(event, baseUrl);
      const res = await ecommercePortal.handleRequest(req);
      return responseToApiGateway(res);
    }

    // JSONata portal
    if (path === "/jsonata" || path === "/jsonata/mcp") {
      const req = createWebRequest(event, baseUrl);
      const res = await jsonataPortal.handleRequest(req);
      return responseToApiGateway(res);
    }

    // Blob portal MCP endpoint
    if (path === "/blob" || path === "/blob/mcp") {
      const req = createWebRequest(event, baseUrl);
      const res = await blobPortal.handleRequest(req);
      return responseToApiGateway(res);
    }

    // =========================================================================
    // Blob Storage API Routes (S3-based presigned URLs)
    // =========================================================================

    // Prepare upload - upload file and get presigned GET URL (5 min TTL)
    if (path === "/blob/prepare-upload" && httpMethod === "POST") {
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

        // For multipart, we need to parse the form data
        if (contentType.includes("multipart/form-data")) {
          // Simple extraction - find the binary data after headers
          const boundary = contentType.match(/boundary=(.+)/)?.[1];
          if (boundary) {
            const parts = body.toString("binary").split(`--${boundary}`);
            for (const part of parts) {
              if (part.includes('name="image"')) {
                // Find the start of binary data (after double CRLF)
                const headerEnd = part.indexOf("\r\n\r\n");
                if (headerEnd !== -1) {
                  const fileData = part.slice(headerEnd + 4);
                  // Remove trailing boundary markers
                  const dataEnd = fileData.lastIndexOf("\r\n");
                  const cleanData = dataEnd !== -1 ? fileData.slice(0, dataEnd) : fileData;
                  const fileBuffer = Buffer.from(cleanData, "binary");

                  // Extract content-type from part headers
                  const partContentType =
                    part.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] ?? "image/png";

                  const result = await storeTempUploadS3(
                    fileBuffer.buffer as ArrayBuffer,
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
    if (path.startsWith("/blob/temp/") && httpMethod === "GET") {
      const id = decodeURIComponent(path.slice("/blob/temp/".length));
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
    if (path === "/blob/prepare-download" && httpMethod === "POST") {
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
    if (path.startsWith("/blob/output/") && httpMethod === "GET") {
      const id = decodeURIComponent(path.slice("/blob/output/".length));
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
    if (path === "/blob/upload" && httpMethod === "POST") {
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
    if (path.startsWith("/blob/files/") && httpMethod === "GET") {
      const key = decodeURIComponent(path.slice("/blob/files/".length));

      // Generate presigned URL and redirect
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
    if (path === "/blob/files" && httpMethod === "GET") {
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

    // Auth portal routes
    if (path.startsWith("/auth")) {
      const authReq = createAuthRequest(event, baseUrl);

      // Handle AWP auth endpoints (/auth/init, /auth/status)
      const authRouteResponse = await routeAuthRequest(authReq, {
        baseUrl,
        pendingAuthStore,
        pubkeyStore,
        authInitPath: "/auth/init",
        authStatusPath: "/auth/status",
        authPagePath: "/auth/page",
      });
      if (authRouteResponse) {
        return responseToApiGateway(authRouteResponse);
      }

      // Auth page - login UI
      if (path === "/auth/page") {
        return {
          statusCode: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
          body: getAuthPageHtml(),
        };
      }

      // Handle login form submission
      if (path === "/auth/login" && httpMethod === "POST") {
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

      // Auth MCP endpoint (requires authentication)
      if (path === "/auth" || path === "/auth/mcp") {
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

        const req = createWebRequest(event, baseUrl);
        const res = await authPortal.handleRequest(req);
        return responseToApiGateway(res);
      }
    }

    // Root route - show available portals
    if (path === "/api" || path === "/api/") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Agent Web Portal - Examples",
          portals: {
            basic: { endpoint: "/basic", description: "Basic greeting portal" },
            ecommerce: { endpoint: "/ecommerce", description: "E-commerce portal" },
            jsonata: { endpoint: "/jsonata", description: "JSONata expression portal" },
            auth: { endpoint: "/auth", description: "Auth-enabled portal" },
            blob: { endpoint: "/blob", description: "Blob-enabled portal" },
          },
          auth: {
            init: "/auth/init",
            status: "/auth/status",
            page: "/auth/page",
          },
          ui: "/ui",
        }),
      };
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
