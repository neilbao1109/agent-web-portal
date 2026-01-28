/**
 * Local Development Server
 *
 * Runs the Agent Service locally using Bun.serve.
 * Simulates Lambda + API Gateway environment for development.
 *
 * Usage:
 *   bun run server.ts
 *
 * Environment Variables:
 *   USER_POOL_ID       - Cognito User Pool ID
 *   USER_POOL_CLIENT_ID - Cognito App Client ID
 *   BLOB_BUCKET        - S3 bucket name for blobs
 *   AWS_REGION         - AWS region (default: us-east-1)
 *   PORT               - Server port (default: 3500)
 */

import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { handler } from "./src/handler";

// ============================================================================
// Configuration
// ============================================================================

const PORT = Number.parseInt(process.env.PORT ?? "3500", 10);

// Check required environment variables
function checkEnv() {
  const required = ["USER_POOL_ID", "USER_POOL_CLIENT_ID", "BLOB_BUCKET"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(", ")}`);
    console.warn("   Some features may not work. Set them in .env or export them.");
    console.warn("");
    console.warn("   Example:");
    console.warn("   export USER_POOL_ID=us-east-1_xxxxx");
    console.warn("   export USER_POOL_CLIENT_ID=xxxxx");
    console.warn("   export BLOB_BUCKET=awp-agent-blobs-dev-xxxxx");
    console.warn("");
  }
}

// ============================================================================
// Request Conversion
// ============================================================================

async function convertToLambdaEvent(req: Request): Promise<APIGatewayProxyEventV2> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};

  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // Read body
  let body: string | undefined;
  let isBase64Encoded = false;

  if (req.method !== "GET" && req.method !== "HEAD") {
    const contentType = headers["content-type"] ?? "";

    if (contentType.startsWith("application/json") || contentType.startsWith("text/")) {
      body = await req.text();
    } else {
      // Binary content
      const buffer = await req.arrayBuffer();
      body = Buffer.from(buffer).toString("base64");
      isBase64Encoded = true;
    }
  }

  // Parse path parameters for blob routes
  const pathParameters: Record<string, string> = {};
  const blobMatch = url.pathname.match(/^\/api\/blob\/([^/]+)$/);
  if (blobMatch?.[1]) {
    pathParameters.id = blobMatch[1];
  }

  return {
    version: "2.0",
    routeKey: `${req.method} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers,
    queryStringParameters: Object.fromEntries(url.searchParams),
    pathParameters: Object.keys(pathParameters).length > 0 ? pathParameters : undefined,
    body,
    isBase64Encoded,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method: req.method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: headers["user-agent"] ?? "",
      },
      requestId: crypto.randomUUID(),
      routeKey: `${req.method} ${url.pathname}`,
      stage: "local",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  };
}

function createMockContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: true,
    functionName: "awp-agent-service-local",
    functionVersion: "$LATEST",
    invokedFunctionArn: "arn:aws:lambda:local:000000000000:function:awp-agent-service-local",
    memoryLimitInMB: "512",
    awsRequestId: crypto.randomUUID(),
    logGroupName: "/aws/lambda/awp-agent-service-local",
    logStreamName: "local",
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

// ============================================================================
// Server
// ============================================================================

checkEnv();

console.log(`
🚀 AWP Agent Service - Local Development Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Endpoints:
  Health:    GET  http://localhost:${PORT}/health

  Auth:
    POST http://localhost:${PORT}/api/auth/signup
    POST http://localhost:${PORT}/api/auth/confirm
    POST http://localhost:${PORT}/api/auth/login
    POST http://localhost:${PORT}/api/auth/refresh
    GET  http://localhost:${PORT}/api/auth/userinfo
    POST http://localhost:${PORT}/api/auth/signout
    POST http://localhost:${PORT}/api/auth/forgot-password
    POST http://localhost:${PORT}/api/auth/reset-password

  Blob Storage:
    POST http://localhost:${PORT}/api/blob/prepare-output
    POST http://localhost:${PORT}/api/blob/prepare-download
    GET  http://localhost:${PORT}/api/blob/{id}
    PUT  http://localhost:${PORT}/api/blob/{id}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

const server = Bun.serve({
  port: PORT,

  async fetch(req: Request): Promise<Response> {
    const start = Date.now();
    const url = new URL(req.url);

    try {
      // Convert to Lambda event
      const event = await convertToLambdaEvent(req);
      const context = createMockContext();

      // Call handler
      const result = await handler(event, context);

      // Handle string response (shouldn't happen but TypeScript requires it)
      if (typeof result === "string") {
        return new Response(result, { status: 200 });
      }

      // Convert result to Response
      const responseHeaders = new Headers();
      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          if (typeof value === "string") {
            responseHeaders.set(key, value);
          }
        }
      }

      let body: BodyInit | null = null;
      if (result.body) {
        if (result.isBase64Encoded) {
          body = Buffer.from(result.body, "base64");
        } else {
          body = result.body;
        }
      }

      const duration = Date.now() - start;
      const statusCode = result.statusCode ?? 200;
      const logColor = statusCode >= 400 ? "\x1b[31m" : "\x1b[32m";
      console.log(`${logColor}${req.method}\x1b[0m ${url.pathname} ${statusCode} ${duration}ms`);

      return new Response(body, {
        status: statusCode,
        headers: responseHeaders,
      });
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`\x1b[31m${req.method}\x1b[0m ${url.pathname} 500 ${duration}ms`);
      console.error(error);

      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
});

console.log(`Server running at http://localhost:${server.port}`);
