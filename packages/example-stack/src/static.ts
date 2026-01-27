/**
 * Static Asset Serving for SST Lambda
 *
 * Serves bundled React app from the dist/ui directory.
 * Note: In SST, static sites are typically deployed separately via CloudFront.
 * This module provides fallback static serving for development/testing.
 */

import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "@agent-web-portal/aws-lambda";

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

// Base path for static assets
// In Lambda: code runs from /var/task, UI is in /var/task/ui
// Locally: defaults to ./ui relative to current working directory
const STATIC_BASE =
  process.env.STATIC_BASE ??
  (process.env.AWS_LAMBDA_FUNCTION_NAME
    ? "/var/task/ui" // Lambda environment
    : join(process.cwd(), "ui"));

/**
 * Serve static assets from the UI build directory
 */
export function serveStaticAssets(
  event: APIGatewayProxyEvent,
  path: string
): APIGatewayProxyResult {
  try {
    // Normalize path
    let filePath = path;

    // Handle root path
    if (path === "/" || path === "/ui" || path === "/ui/") {
      filePath = "/index.html";
    } else if (path.startsWith("/ui/")) {
      filePath = path.slice(3); // Remove /ui prefix
    }

    // Security: prevent directory traversal
    if (filePath.includes("..")) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Forbidden" }),
      };
    }

    // Build full file path
    const fullPath = join(STATIC_BASE, filePath);

    // Check if file exists
    if (!existsSync(fullPath)) {
      // For SPA routing, fallback to index.html for non-asset paths
      const ext = extname(filePath);
      if (!ext || ext === ".html") {
        const indexPath = join(STATIC_BASE, "index.html");
        if (existsSync(indexPath)) {
          const content = readFileSync(indexPath, "utf-8");
          return {
            statusCode: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache",
            },
            body: content,
          };
        }
      }

      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Not Found", path }),
      };
    }

    // Read file
    const ext = extname(filePath);
    const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";
    const isBinary =
      !mimeType.includes("text") && !mimeType.includes("json") && !mimeType.includes("javascript");

    if (isBinary) {
      // Binary file - return as base64
      const content = readFileSync(fullPath);
      return {
        statusCode: 200,
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
        body: content.toString("base64"),
        isBase64Encoded: true,
      };
    } else {
      // Text file
      const content = readFileSync(fullPath, "utf-8");
      return {
        statusCode: 200,
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
        },
        body: content,
      };
    }
  } catch (error) {
    console.error("Error serving static asset:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
}
