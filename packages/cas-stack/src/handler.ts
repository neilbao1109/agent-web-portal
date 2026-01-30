/**
 * CAS Stack - AWS Lambda Handler
 */

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import { Router } from "./router.ts";
import { type HttpRequest, loadConfig } from "./types.ts";

// Create router with config from environment
const config = loadConfig();
const router = new Router(config);

/**
 * Type guard to detect REST API v1 event format
 */
function isRestApiEvent(event: any): event is APIGatewayProxyEvent {
  return event.httpMethod !== undefined;
}

/**
 * Convert API Gateway event to HttpRequest (supports both v1 REST API and v2 HTTP API)
 */
function toHttpRequest(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): HttpRequest {
  // Normalize headers to lowercase
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    headers[key.toLowerCase()] = value ?? undefined;
    headers[key] = value ?? undefined; // Keep original case too
  }

  // Handle both REST API (v1) and HTTP API (v2) formats
  const isV1 = isRestApiEvent(event);
  const method = isV1
    ? event.httpMethod
    : (event as APIGatewayProxyEventV2).requestContext.http.method;
  const path = isV1 ? event.path : (event as APIGatewayProxyEventV2).rawPath;

  return {
    method,
    path,
    headers,
    query: event.queryStringParameters ?? {},
    pathParams: (event.pathParameters ?? {}) as Record<string, string>,
    body: event.body ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf-8") : null,
    isBase64Encoded: event.isBase64Encoded,
  };
}

/**
 * Lambda handler entry point (supports both REST API v1 and HTTP API v2)
 */
export async function handler(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResult | APIGatewayProxyResultV2> {
  const isV1 = isRestApiEvent(event);
  const method = isV1
    ? event.httpMethod
    : (event as APIGatewayProxyEventV2).requestContext.http.method;
  const path = isV1 ? event.path : (event as APIGatewayProxyEventV2).rawPath;

  console.log(`[CAS] ${method} ${path}`);

  // Debug: log request body for POST requests
  if (method === "POST" || method === "PUT") {
    console.log(`[CAS] Request body: ${event.body}, isBase64Encoded: ${event.isBase64Encoded}`);
  }

  try {
    const req = toHttpRequest(event);
    const res = await router.handle(req);

    return {
      statusCode: res.statusCode,
      headers: res.headers,

      body: res.body?.toString() ?? "",
      isBase64Encoded: res.isBase64Encoded ?? false,
    };
  } catch (error: any) {
    console.error("[CAS] Unhandled error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
}
