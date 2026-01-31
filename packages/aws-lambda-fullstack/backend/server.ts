/**
 * AWS Lambda Fullstack Template - Local Development Server
 *
 * Runs the Lambda handler as a local HTTP server for development.
 * Simulates API Gateway event structure.
 */

import { handler } from "./src/handler.ts";

const PORT = Number.parseInt(process.env.PORT ?? "3500", 10);

console.log(`[API] Starting local development server on port ${PORT}...`);

const server = Bun.serve({
  port: PORT,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Build API Gateway-like event
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Parse query parameters
    const queryStringParameters: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryStringParameters[key] = value;
    });

    // Read body
    let body: string | null = null;
    let isBase64Encoded = false;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const contentType = request.headers.get("content-type") ?? "";
      if (
        contentType.includes("application/octet-stream") ||
        contentType.includes("multipart/form-data")
      ) {
        const buffer = await request.arrayBuffer();
        body = Buffer.from(buffer).toString("base64");
        isBase64Encoded = true;
      } else {
        body = await request.text();
      }
    }

    const event = {
      httpMethod: request.method,
      path: url.pathname,
      headers,
      queryStringParameters,
      body,
      isBase64Encoded,
      requestContext: {
        requestId: crypto.randomUUID(),
        stage: "local",
        httpMethod: request.method,
        path: url.pathname,
      },
    };

    try {
      const result = await handler(event as never, {} as never);

      if (!result || typeof result !== "object") {
        return new Response("Internal Server Error", { status: 500 });
      }

      // Handle API Gateway response format
      const apiResult = result as {
        statusCode?: number;
        headers?: Record<string, string>;
        body?: string;
        isBase64Encoded?: boolean;
      };

      if (apiResult.statusCode !== undefined) {
        let responseBody: string | null = null;

        if (apiResult.body) {
          responseBody = apiResult.isBase64Encoded
            ? Buffer.from(apiResult.body, "base64").toString("binary")
            : apiResult.body;
        }

        const responseHeaders: Record<string, string> = {};
        if (apiResult.headers) {
          for (const [key, value] of Object.entries(apiResult.headers)) {
            if (value !== undefined) {
              responseHeaders[key] = String(value);
            }
          }
        }

        return new Response(responseBody, {
          status: apiResult.statusCode,
          headers: responseHeaders,
        });
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[API] Handler error:", error);
      return new Response(
        JSON.stringify({ error: "Internal Server Error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
});

console.log(`[API] Server running at http://localhost:${server.port}`);
console.log("[API] Press Ctrl+C to stop");
