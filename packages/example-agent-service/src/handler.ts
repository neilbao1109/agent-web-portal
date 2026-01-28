/**
 * AWS Lambda HTTP Handler
 *
 * Main entry point for the Agent Service Lambda function.
 * Routes requests to auth and blob handlers.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { z } from "zod";
import {
  AuthError,
  getAuthService,
  type LoginRequest,
  type SignUpRequest,
  type UserInfo,
} from "./auth";
import { BlobError, getBlobStorageService, type PrepareOutputRequest } from "./blob";

// ============================================================================
// Types
// ============================================================================

interface RouteContext {
  event: APIGatewayProxyEventV2;
  user?: UserInfo;
}

type RouteHandler = (ctx: RouteContext) => Promise<APIGatewayProxyResultV2>;

// ============================================================================
// Request Validation Schemas
// ============================================================================

const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const ConfirmSignUpSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const RefreshSchema = z.object({
  refreshToken: z.string(),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
  newPassword: z.string().min(8),
});

const PrepareOutputSchema = z.object({
  contentType: z.string().optional(),
  prefix: z.string().optional(),
});

const PrepareDownloadSchema = z.object({
  uri: z.string(),
});

// ============================================================================
// Response Helpers
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

function jsonResponse(
  statusCode: number,
  body: unknown,
  headers?: Record<string, string>
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function binaryResponse(data: Uint8Array, contentType: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": contentType,
      ...CORS_HEADERS,
    },
    body: Buffer.from(data).toString("base64"),
    isBase64Encoded: true,
  };
}

function errorResponse(
  statusCode: number,
  message: string,
  code?: string
): APIGatewayProxyResultV2 {
  return jsonResponse(statusCode, { error: message, code });
}

function parseBody<T>(event: APIGatewayProxyEventV2, schema: z.ZodSchema<T>): T {
  if (!event.body) {
    throw new ValidationError("Request body is required");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.isBase64Encoded ? atob(event.body) : event.body);
  } catch {
    throw new ValidationError("Invalid JSON in request body");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new ValidationError(firstIssue?.message ?? "Validation failed");
  }

  return result.data;
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// ============================================================================
// Auth Middleware
// ============================================================================

async function extractUser(event: APIGatewayProxyEventV2): Promise<UserInfo | undefined> {
  const authHeader = event.headers.authorization ?? event.headers.Authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return undefined;
  }

  const token = authHeader.slice(7);

  try {
    const authService = getAuthService();
    return await authService.verifyToken(token);
  } catch {
    return undefined;
  }
}

// ============================================================================
// Auth Route Handlers
// ============================================================================

async function handleSignUp(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(ctx.event, SignUpSchema);
  const authService = getAuthService();

  try {
    const result = await authService.signUp(body as SignUpRequest);
    return jsonResponse(201, result);
  } catch (error) {
    const authError = AuthError.fromCognitoError(error);
    return errorResponse(400, authError.message, authError.code);
  }
}

async function handleConfirmSignUp(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(ctx.event, ConfirmSignUpSchema);
  const authService = getAuthService();

  try {
    await authService.confirmSignUp(body);
    return jsonResponse(200, { message: "Email confirmed successfully" });
  } catch (error) {
    const authError = AuthError.fromCognitoError(error);
    return errorResponse(400, authError.message, authError.code);
  }
}

async function handleResendCode(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(ctx.event, z.object({ email: z.string().email() }));
  const authService = getAuthService();

  try {
    const destination = await authService.resendConfirmationCode(body.email);
    return jsonResponse(200, { message: "Code sent", destination });
  } catch (error) {
    const authError = AuthError.fromCognitoError(error);
    return errorResponse(400, authError.message, authError.code);
  }
}

async function handleLogin(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(ctx.event, LoginSchema);
  const authService = getAuthService();

  try {
    const tokens = await authService.login(body as LoginRequest);
    return jsonResponse(200, tokens);
  } catch (error) {
    const authError = AuthError.fromCognitoError(error);
    return errorResponse(401, authError.message, authError.code);
  }
}

async function handleRefresh(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(ctx.event, RefreshSchema);
  const authService = getAuthService();

  try {
    const tokens = await authService.refresh(body);
    return jsonResponse(200, tokens);
  } catch (error) {
    const authError = AuthError.fromCognitoError(error);
    return errorResponse(401, authError.message, authError.code);
  }
}

async function handleUserInfo(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  // User is already extracted by middleware
  return jsonResponse(200, ctx.user);
}

async function handleSignOut(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const authHeader = ctx.event.headers.authorization ?? ctx.event.headers.Authorization;
  const token = authHeader?.slice(7);

  if (!token) {
    return errorResponse(401, "Authentication required", "UNAUTHORIZED");
  }

  const authService = getAuthService();

  try {
    await authService.signOut(token);
    return jsonResponse(200, { message: "Signed out successfully" });
  } catch (error) {
    const authError = AuthError.fromCognitoError(error);
    return errorResponse(400, authError.message, authError.code);
  }
}

async function handleForgotPassword(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(ctx.event, ForgotPasswordSchema);
  const authService = getAuthService();

  try {
    const destination = await authService.forgotPassword(body);
    return jsonResponse(200, { message: "Reset code sent", destination });
  } catch (error) {
    const authError = AuthError.fromCognitoError(error);
    return errorResponse(400, authError.message, authError.code);
  }
}

async function handleResetPassword(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(ctx.event, ResetPasswordSchema);
  const authService = getAuthService();

  try {
    await authService.resetPassword(body);
    return jsonResponse(200, { message: "Password reset successfully" });
  } catch (error) {
    const authError = AuthError.fromCognitoError(error);
    return errorResponse(400, authError.message, authError.code);
  }
}

// ============================================================================
// Blob Route Handlers
// ============================================================================

async function handlePrepareOutput(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(ctx.event, PrepareOutputSchema);
  const blobService = getBlobStorageService();

  const request: PrepareOutputRequest = {
    userId: ctx.user!.sub,
    contentType: body.contentType,
    prefix: body.prefix,
  };

  try {
    const result = await blobService.prepareOutput(request);
    return jsonResponse(200, result);
  } catch (error) {
    if (error instanceof BlobError) {
      return errorResponse(400, error.message, error.code);
    }
    throw error;
  }
}

async function handlePrepareDownload(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(ctx.event, PrepareDownloadSchema);
  const blobService = getBlobStorageService();

  try {
    const result = await blobService.prepareDownload(body, ctx.user?.sub);
    return jsonResponse(200, result);
  } catch (error) {
    if (error instanceof BlobError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return errorResponse(status, error.message, error.code);
    }
    throw error;
  }
}

async function handleReadBlob(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const blobId = ctx.event.pathParameters?.id;

  if (!blobId) {
    return errorResponse(400, "Blob ID is required", "INVALID_URI");
  }

  const blobService = getBlobStorageService();

  try {
    const { data, contentType } = await blobService.readBlob(blobId, ctx.user?.sub);
    return binaryResponse(data, contentType);
  } catch (error) {
    if (error instanceof BlobError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return errorResponse(status, error.message, error.code);
    }
    throw error;
  }
}

async function handleWriteBlob(ctx: RouteContext): Promise<APIGatewayProxyResultV2> {
  const blobId = ctx.event.pathParameters?.id;

  if (!blobId) {
    return errorResponse(400, "Blob ID is required", "INVALID_URI");
  }

  if (!ctx.event.body) {
    return errorResponse(400, "Request body is required", "INVALID_URI");
  }

  const contentType = ctx.event.headers["content-type"] ?? "application/octet-stream";
  const data = ctx.event.isBase64Encoded
    ? Uint8Array.from(atob(ctx.event.body), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(ctx.event.body);

  const blobService = getBlobStorageService();

  try {
    await blobService.writeBlob(blobId, data, contentType, ctx.user!.sub);
    return jsonResponse(201, { message: "Blob uploaded successfully", blobId });
  } catch (error) {
    if (error instanceof BlobError) {
      return errorResponse(400, error.message, error.code);
    }
    throw error;
  }
}

// ============================================================================
// Router
// ============================================================================

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
  requiresAuth: boolean;
}

const routes: Route[] = [
  // Health check
  {
    method: "GET",
    pattern: /^\/?$/,
    handler: async () => jsonResponse(200, { status: "ok", service: "awp-agent-service" }),
    requiresAuth: false,
  },
  {
    method: "GET",
    pattern: /^\/health$/,
    handler: async () => jsonResponse(200, { status: "ok" }),
    requiresAuth: false,
  },

  // Auth routes (public)
  { method: "POST", pattern: /^\/api\/auth\/signup$/, handler: handleSignUp, requiresAuth: false },
  {
    method: "POST",
    pattern: /^\/api\/auth\/confirm$/,
    handler: handleConfirmSignUp,
    requiresAuth: false,
  },
  {
    method: "POST",
    pattern: /^\/api\/auth\/resend-code$/,
    handler: handleResendCode,
    requiresAuth: false,
  },
  { method: "POST", pattern: /^\/api\/auth\/login$/, handler: handleLogin, requiresAuth: false },
  {
    method: "POST",
    pattern: /^\/api\/auth\/refresh$/,
    handler: handleRefresh,
    requiresAuth: false,
  },
  {
    method: "POST",
    pattern: /^\/api\/auth\/forgot-password$/,
    handler: handleForgotPassword,
    requiresAuth: false,
  },
  {
    method: "POST",
    pattern: /^\/api\/auth\/reset-password$/,
    handler: handleResetPassword,
    requiresAuth: false,
  },

  // Auth routes (protected)
  {
    method: "GET",
    pattern: /^\/api\/auth\/userinfo$/,
    handler: handleUserInfo,
    requiresAuth: true,
  },
  { method: "POST", pattern: /^\/api\/auth\/signout$/, handler: handleSignOut, requiresAuth: true },

  // Blob routes (protected)
  {
    method: "POST",
    pattern: /^\/api\/blob\/prepare-output$/,
    handler: handlePrepareOutput,
    requiresAuth: true,
  },
  {
    method: "POST",
    pattern: /^\/api\/blob\/prepare-download$/,
    handler: handlePrepareDownload,
    requiresAuth: true,
  },
  { method: "GET", pattern: /^\/api\/blob\/([^/]+)$/, handler: handleReadBlob, requiresAuth: true },
  {
    method: "PUT",
    pattern: /^\/api\/blob\/([^/]+)$/,
    handler: handleWriteBlob,
    requiresAuth: true,
  },
];

function matchRoute(
  method: string,
  path: string
): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;

    const match = path.match(route.pattern);
    if (match) {
      const params: Record<string, string> = {};
      if (match[1]) {
        params.id = match[1];
      }
      return { route, params };
    }
  }
  return null;
}

// ============================================================================
// Lambda Handler
// ============================================================================

export async function handler(
  event: APIGatewayProxyEventV2,
  _context: Context
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  console.log(`${method} ${path}`);

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  try {
    // Extract user from token (if present)
    const user = await extractUser(event);

    // Find matching route
    const match = matchRoute(method, path);

    if (!match) {
      return errorResponse(404, "Not found");
    }

    // Inject path parameters
    if (match.params.id) {
      event.pathParameters = { ...event.pathParameters, id: match.params.id };
    }

    // Create route context
    const ctx: RouteContext = { event, user };

    // Check auth requirement
    if (match.route.requiresAuth && !user) {
      return errorResponse(401, "Authentication required", "UNAUTHORIZED");
    }

    // Execute handler
    return await match.route.handler(ctx);
  } catch (error) {
    console.error("Unhandled error:", error);

    if (error instanceof ValidationError) {
      return errorResponse(400, error.message, "VALIDATION_ERROR");
    }

    return errorResponse(500, "Internal server error");
  }
}
