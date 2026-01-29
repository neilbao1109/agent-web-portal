/**
 * CAS Stack - AWS Lambda Handler
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { loadConfig, type HttpRequest } from "./types.ts";
import { Router } from "./router.ts";

// Create router with config from environment
const config = loadConfig();
const router = new Router(config);

/**
 * Convert API Gateway event to HttpRequest
 */
function toHttpRequest(event: APIGatewayProxyEventV2): HttpRequest {
  // Normalize headers to lowercase
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    headers[key.toLowerCase()] = value;
    headers[key] = value; // Keep original case too
  }

  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    headers,
    query: event.queryStringParameters ?? {},
    pathParams: (event.pathParameters ?? {}) as Record<string, string>,
    body: event.body ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf-8") : null,
    isBase64Encoded: event.isBase64Encoded,
  };
}

/**
 * Lambda handler entry point
 */
export async function handler(
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> {
  console.log(`[CAS] ${event.requestContext.http.method} ${event.rawPath}`);

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
