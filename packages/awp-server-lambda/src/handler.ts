/**
 * AWP Server Lambda - Handler Implementation
 *
 * Converts AWS Lambda events to/from standard Request/Response objects
 * and routes them to the ServerPortal.
 */

import type { ServerPortal } from "@agent-web-portal/awp-server-core";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  LambdaContext,
  LambdaHandler,
  LambdaHandlerBuildOptions,
  LambdaRouteHandler,
} from "./types.ts";

/**
 * Extended build options with custom routes
 */
interface CreateLambdaHandlerOptions extends LambdaHandlerBuildOptions {
  customRoutes?: LambdaRouteHandler[];
}

/**
 * Create a Lambda handler from a ServerPortal
 *
 * @param portal - The ServerPortal instance
 * @param options - Handler options
 * @returns Lambda handler function
 */
export function createLambdaHandler(
  portal: ServerPortal,
  options: CreateLambdaHandlerOptions = {}
): LambdaHandler {
  const { cors = true, corsOrigin = "*", logging = false, customRoutes = [] } = options;

  return async (
    event: APIGatewayProxyEvent,
    context: LambdaContext
  ): Promise<APIGatewayProxyResult> => {
    // Log request if enabled
    if (logging) {
      console.log("Request:", {
        method: event.httpMethod,
        path: event.path,
        requestId: context.awsRequestId,
      });
    }

    try {
      // Handle CORS preflight
      if (event.httpMethod === "OPTIONS" && cors) {
        return createCorsPreflightResponse(corsOrigin);
      }

      // Convert Lambda event to standard Request
      const request = eventToRequest(event);

      // Try custom routes first
      for (const routeHandler of customRoutes) {
        const response = await routeHandler(request, event, context);
        if (response) {
          return responseToResult(response, cors, corsOrigin);
        }
      }

      // Handle MCP endpoint (default route)
      const response = await portal.handleRequest(request);

      return responseToResult(response, cors, corsOrigin);
    } catch (error) {
      console.error("Handler error:", error);

      const errorResponse: APIGatewayProxyResult = {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          ...(cors ? getCorsHeaders(corsOrigin) : {}),
        },
        body: JSON.stringify({
          error: error instanceof Error ? error.message : "Internal server error",
        }),
      };

      return errorResponse;
    }
  };
}

/**
 * Convert Lambda API Gateway event to standard Request object
 */
function eventToRequest(event: APIGatewayProxyEvent): Request {
  // Build URL
  const protocol = "https";
  const host = event.headers?.Host ?? event.headers?.host ?? "localhost";
  const path = event.path;
  const queryString = event.queryStringParameters
    ? `?${new URLSearchParams(
        Object.entries(event.queryStringParameters).filter(([_, v]) => v !== undefined) as [
          string,
          string,
        ][]
      ).toString()}`
    : "";

  const url = `${protocol}://${host}${path}${queryString}`;

  // Build headers
  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (value) {
      headers.set(key, value);
    }
  }

  // Build body
  let body: BodyInit | undefined;
  if (event.body) {
    body = event.isBase64Encoded
      ? Uint8Array.from(atob(event.body), (c) => c.charCodeAt(0))
      : event.body;
  }

  // Create Request
  return new Request(url, {
    method: event.httpMethod,
    headers,
    body: event.httpMethod !== "GET" && event.httpMethod !== "HEAD" ? body : undefined,
  });
}

/**
 * Convert standard Response to Lambda API Gateway result
 */
async function responseToResult(
  response: Response,
  cors: boolean,
  corsOrigin: string
): Promise<APIGatewayProxyResult> {
  // Get response body
  const body = await response.text();

  // Build headers
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Add CORS headers if enabled
  if (cors) {
    Object.assign(headers, getCorsHeaders(corsOrigin));
  }

  return {
    statusCode: response.status,
    headers,
    body,
  };
}

/**
 * Get CORS headers
 */
function getCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Create CORS preflight response
 */
function createCorsPreflightResponse(origin: string): APIGatewayProxyResult {
  return {
    statusCode: 204,
    headers: getCorsHeaders(origin),
    body: "",
  };
}
