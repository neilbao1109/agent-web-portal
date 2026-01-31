/**
 * AWS Lambda Fullstack Template - API Handler
 *
 * This is the main Lambda handler for the API.
 * All /api/* routes are routed here via API Gateway + CloudFront.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";

// ============================================================================
// Types
// ============================================================================

interface RouteHandler {
  (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>;
}

// ============================================================================
// Response Helpers
// ============================================================================

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return jsonResponse(statusCode, { error: message });
}

// ============================================================================
// Route Handlers
// ============================================================================

async function handleHealth(): Promise<APIGatewayProxyResult> {
  return jsonResponse(200, {
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "aws-lambda-fullstack",
  });
}

async function handleHello(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const name = event.queryStringParameters?.name ?? "World";
  return jsonResponse(200, {
    message: `Hello, ${name}!`,
  });
}

// ============================================================================
// Router
// ============================================================================

const routes: Record<string, Record<string, RouteHandler>> = {
  GET: {
    "/api/health": handleHealth,
    "/api/hello": handleHello,
  },
  POST: {
    // Add POST routes here
  },
  PUT: {
    // Add PUT routes here
  },
  DELETE: {
    // Add DELETE routes here
  },
};

function matchRoute(method: string, path: string): RouteHandler | null {
  const methodRoutes = routes[method];
  if (!methodRoutes) return null;

  // Exact match
  if (methodRoutes[path]) {
    return methodRoutes[path];
  }

  // TODO: Add pattern matching for dynamic routes like /api/users/:id

  return null;
}

// ============================================================================
// Main Handler
// ============================================================================

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const { httpMethod, path } = event;

  console.log(`[API] ${httpMethod} ${path}`);

  // Handle CORS preflight
  if (httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      },
      body: "",
    };
  }

  try {
    const routeHandler = matchRoute(httpMethod, path);

    if (routeHandler) {
      return await routeHandler(event);
    }

    return errorResponse(404, `Route not found: ${httpMethod} ${path}`);
  } catch (error) {
    console.error("[API] Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return errorResponse(500, message);
  }
}
