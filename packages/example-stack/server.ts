/**
 * Local Development Server for AWP Examples (SST)
 *
 * This is a Bun-based server for local development and testing.
 * For production, use `npx sst deploy` to deploy to AWS.
 *
 * Run with: bun run server.ts
 */

// Polyfill for JSZip
import "setimmediate";

import {
  type AuthHttpRequest,
  type AuthorizedPubkey,
  completeAuthorization,
  createAwpAuthMiddleware,
  MemoryPendingAuthStore,
  MemoryPubkeyStore,
  routeAuthRequest,
} from "@agent-web-portal/auth";
import {
  createClearSessionCookie,
  createSession,
  createSessionCookie,
  getSessionFromRequest,
  validateCredentials,
} from "./src/auth/session.ts";
import { getAuthPageHtml, getAuthSuccessHtml } from "./src/auth/ui.ts";
import {
  createOutputBlobSlot,
  getStoredImage,
  getTempUpload,
  listStoredImages,
  readOutputBlob,
  storeImage,
  storeTempUpload,
  writeOutputBlob,
} from "./src/portals/blob.ts";
import {
  authPortal,
  basicPortal,
  blobPortal,
  ecommercePortal,
  jsonataPortal,
} from "./src/portals/index.ts";

// =============================================================================
// Configuration
// =============================================================================

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3400;

// =============================================================================
// Utility Functions
// =============================================================================

interface SkillFrontmatter {
  name: string;
  description?: string;
  version?: string;
  "allowed-tools"?: string[];
  [key: string]: unknown;
}

/**
 * Parse YAML-like frontmatter from SKILL.md
 */
function parseFrontmatter(content: string): SkillFrontmatter | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match || !match[1]) return null;

  const frontmatterText = match[1];
  const result: SkillFrontmatter = { name: "" };

  const lines = frontmatterText.split("\n");
  let currentKey = "";
  let inArray = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for array item
    if (inArray && trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim();
      if (Array.isArray(result[currentKey])) {
        (result[currentKey] as string[]).push(value);
      }
      continue;
    }

    // Check for key: value
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      currentKey = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (value === "") {
        // Could be start of array
        result[currentKey] = [];
        inArray = true;
      } else {
        result[currentKey] = value;
        inArray = false;
      }
    }
  }

  return result;
}

// =============================================================================
// Auth Stores (in-memory for local development)
// =============================================================================

const pendingAuthStore = new MemoryPendingAuthStore();
const pubkeyStore = new MemoryPubkeyStore();

const authMiddleware = createAwpAuthMiddleware({
  pendingAuthStore,
  pubkeyStore,
  authInitPath: "/api/auth/init",
  authStatusPath: "/api/auth/status",
  authPagePath: "/api/auth/page",
});

// =============================================================================
// Request Handler
// =============================================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, Mcp-Session-Id, X-AWP-Signature, X-AWP-Pubkey, X-AWP-Timestamp",
      },
    });
  }

  // Health check - /api/health
  if (pathname === "/api/health") {
    return new Response(
      JSON.stringify({ status: "ok", timestamp: new Date().toISOString(), deployment: "local" }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // =========================================================================
  // Portal MCP Endpoints - /api/awp/*
  // =========================================================================

  // Basic portal - /api/awp/basic
  if (pathname === "/api/awp/basic" || pathname === "/api/awp/basic/mcp") {
    return basicPortal.handleRequest(req);
  }

  // E-commerce portal - /api/awp/ecommerce
  if (pathname === "/api/awp/ecommerce" || pathname === "/api/awp/ecommerce/mcp") {
    return ecommercePortal.handleRequest(req);
  }

  // JSONata portal - /api/awp/jsonata
  if (pathname === "/api/awp/jsonata" || pathname === "/api/awp/jsonata/mcp") {
    return jsonataPortal.handleRequest(req);
  }

  // Blob portal - /api/awp/blob
  if (pathname === "/api/awp/blob" || pathname === "/api/awp/blob/mcp") {
    return blobPortal.handleRequest(req);
  }

  // ==========================================================================
  // Blob Storage API routes - /api/blob/*
  // ==========================================================================

  // Prepare upload - upload file and get a temporary presigned GET URL (5 min TTL)
  if (pathname === "/api/blob/prepare-upload" && req.method === "POST") {
    try {
      const contentType = req.headers.get("content-type") ?? "";

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        const file = formData.get("image") as File | null;

        if (!file) {
          return new Response(JSON.stringify({ error: "No image file provided" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const data = await file.arrayBuffer();
        const result = storeTempUpload(data, file.type || "image/png");

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Handle raw binary upload
      const data = await req.arrayBuffer();
      const imageContentType = contentType.startsWith("image/") ? contentType : "image/png";
      const result = storeTempUpload(data, imageContentType);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Failed to prepare upload" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Get temporary upload (presigned GET URL equivalent)
  if (pathname.startsWith("/api/blob/temp/") && req.method === "GET") {
    const id = decodeURIComponent(pathname.slice("/api/blob/temp/".length));
    const upload = getTempUpload(id);

    if (!upload) {
      return new Response(JSON.stringify({ error: "Temporary upload not found or expired" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(upload.data, {
      status: 200,
      headers: {
        "Content-Type": upload.contentType,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Prepare download - create output blob slot and get presigned URLs
  if (pathname === "/api/blob/prepare-download" && req.method === "POST") {
    const result = createOutputBlobSlot();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Write to output blob (presigned PUT URL equivalent)
  if (pathname.startsWith("/api/blob/output/") && req.method === "PUT") {
    const id = decodeURIComponent(pathname.slice("/api/blob/output/".length));
    const contentType = req.headers.get("content-type") ?? "application/octet-stream";
    const data = await req.arrayBuffer();

    const success = writeOutputBlob(id, data, contentType);

    if (!success) {
      return new Response(JSON.stringify({ error: "Output blob not found or expired" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Read from output blob
  if (pathname.startsWith("/api/blob/output/") && req.method === "GET") {
    const id = decodeURIComponent(pathname.slice("/api/blob/output/".length));
    const blob = readOutputBlob(id);

    if (!blob) {
      return new Response(JSON.stringify({ error: "Output blob not found or expired" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(blob.data, {
      status: 200,
      headers: {
        "Content-Type": blob.contentType,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Direct upload to permanent storage
  if (pathname === "/api/blob/upload" && req.method === "POST") {
    try {
      const contentType = req.headers.get("content-type") ?? "";

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        const file = formData.get("image") as File | null;

        if (!file) {
          return new Response(JSON.stringify({ error: "No image file provided" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const data = await file.arrayBuffer();
        const result = storeImage(data, file.type || "image/png");

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Handle raw binary upload
      const data = await req.arrayBuffer();
      const imageContentType = contentType.startsWith("image/") ? contentType : "image/png";
      const result = storeImage(data, imageContentType);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Failed to upload image" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Download image from permanent storage
  if (pathname.startsWith("/api/blob/files/") && req.method === "GET") {
    const key = decodeURIComponent(pathname.slice("/api/blob/files/".length));
    const image = getStoredImage(key);

    if (!image) {
      return new Response(JSON.stringify({ error: "Image not found or expired" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(image.data, {
      status: 200,
      headers: {
        "Content-Type": image.contentType,
        "Content-Disposition": `inline; filename="${key.split("/").pop()}"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // List images in permanent storage
  if (pathname === "/api/blob/files" && req.method === "GET") {
    const images = listStoredImages();
    return new Response(JSON.stringify({ images, count: images.length }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // ==========================================================================
  // Auth API routes - /api/auth/*
  // ==========================================================================

  // Login API (JSON) - /api/auth/login
  if (pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await req.json();
      const { username, password } = body as { username: string; password: string };

      const user = validateCredentials(username, password);
      if (!user) {
        return new Response(JSON.stringify({ error: "Invalid username or password" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { sessionId, session } = createSession(user);
      return new Response(
        JSON.stringify({
          success: true,
          user: { userId: session.userId, username: session.username },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": createSessionCookie(sessionId),
          },
        }
      );
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Logout API - /api/auth/logout
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": createClearSessionCookie(),
      },
    });
  }

  // Get current user session - /api/auth/me
  if (pathname === "/api/auth/me" && req.method === "GET") {
    const session = getSessionFromRequest(req);
    if (!session) {
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        authenticated: true,
        user: { userId: session.userId, username: session.username },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // ==========================================================================
  // Client Management API routes - /api/auth/clients/*
  // ==========================================================================

  // List authorized clients for current user - /api/auth/clients
  if (pathname === "/api/auth/clients" && req.method === "GET") {
    const session = getSessionFromRequest(req);
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clients = await pubkeyStore.listByUser(session.userId);
    return new Response(
      JSON.stringify({
        clients: clients.map((c: AuthorizedPubkey) => ({
          pubkey: c.pubkey,
          clientName: c.clientName,
          createdAt: c.createdAt,
          expiresAt: c.expiresAt,
        })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Revoke a client authorization - DELETE /api/auth/clients/:pubkey
  if (pathname.startsWith("/api/auth/clients/") && req.method === "DELETE") {
    const session = getSessionFromRequest(req);
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pubkeyEncoded = pathname.slice("/api/auth/clients/".length);
    const pubkey = decodeURIComponent(pubkeyEncoded);

    const authInfo = await pubkeyStore.lookup(pubkey);
    if (!authInfo || authInfo.userId !== session.userId) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await pubkeyStore.revoke(pubkey);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Renew a client authorization - PATCH /api/auth/clients/:pubkey
  if (pathname.startsWith("/api/auth/clients/") && req.method === "PATCH") {
    const session = getSessionFromRequest(req);
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pubkeyEncoded = pathname.slice("/api/auth/clients/".length);
    const pubkey = decodeURIComponent(pubkeyEncoded);

    const authInfo = await pubkeyStore.lookup(pubkey);
    if (!authInfo || authInfo.userId !== session.userId) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await req.json();
      const { expiresIn } = body as { expiresIn?: number };

      const newExpiresAt = expiresIn ? Date.now() + expiresIn * 1000 : undefined;
      const updatedAuth: AuthorizedPubkey = {
        ...authInfo,
        expiresAt: newExpiresAt,
      };
      await pubkeyStore.store(updatedAuth);

      return new Response(
        JSON.stringify({
          success: true,
          client: {
            pubkey: updatedAuth.pubkey,
            clientName: updatedAuth.clientName,
            createdAt: updatedAuth.createdAt,
            expiresAt: updatedAuth.expiresAt,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // ==========================================================================
  // AWP Auth Flow routes - /api/auth/*
  // ==========================================================================

  if (pathname.startsWith("/api/auth")) {
    const authReq: AuthHttpRequest = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      text: () => req.clone().text(),
      clone: () => ({
        method: req.method,
        url: req.url,
        headers: req.headers,
        text: () => req.clone().text(),
        clone: () => authReq.clone(),
      }),
    };

    // Handle AWP auth endpoints (/api/auth/init, /api/auth/status)
    const authRouteResponse = await routeAuthRequest(authReq, {
      baseUrl: `http://localhost:${PORT}`,
      pendingAuthStore,
      pubkeyStore,
      authInitPath: "/api/auth/init",
      authStatusPath: "/api/auth/status",
      authPagePath: "/api/auth/page",
    });
    if (authRouteResponse) {
      return authRouteResponse;
    }

    // Auth page - redirect to login if not authenticated
    if (pathname === "/api/auth/page") {
      const session = getSessionFromRequest(req);
      const pubkey = url.searchParams.get("pubkey") ?? "";

      if (!session) {
        const returnUrl = encodeURIComponent(`/api/auth/page?pubkey=${encodeURIComponent(pubkey)}`);
        return new Response(null, {
          status: 302,
          headers: { Location: `/login?returnUrl=${returnUrl}` },
        });
      }

      const pendingAuth = await pendingAuthStore.get(pubkey);
      return new Response(
        getAuthPageHtml(undefined, pendingAuth?.clientName, pendingAuth?.verificationCode),
        {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    // Auth success page
    if (pathname === "/api/auth/success") {
      return new Response(getAuthSuccessHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Auth complete - verify code and authorize (requires session)
    if (pathname === "/api/auth/complete" && req.method === "POST") {
      const session = getSessionFromRequest(req);
      if (!session) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const body = await req.json();
        const { pubkey, verification_code, expires_in } = body as {
          pubkey: string;
          verification_code: string;
          expires_in?: number;
        };

        const result = await completeAuthorization(pubkey, verification_code, session.userId, {
          pendingAuthStore,
          pubkeyStore,
          authorizationTTL: expires_in,
        });

        if (result.success) {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ error: result.error, error_description: result.errorDescription }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Legacy login form handler (for AWP auth page)
    if (pathname === "/api/auth/form-login" && req.method === "POST") {
      const contentType = req.headers.get("content-type") ?? "";
      const formData: Record<string, string> = {};

      if (contentType.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        const params = new URLSearchParams(text);
        for (const [key, value] of params) {
          formData[key] = value;
        }
      } else if (contentType.includes("multipart/form-data")) {
        const data = await req.formData();
        data.forEach((value, key) => {
          if (typeof value === "string") {
            formData[key] = value;
          }
        });
      }

      const username = formData.username ?? "";
      const password = formData.password ?? "";
      const verificationCode = formData.verification_code ?? "";
      const pubkey = formData.pubkey ?? "";

      const user = validateCredentials(username, password);
      if (!user) {
        return new Response(getAuthPageHtml("Invalid username or password"), {
          status: 401,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      const result = await completeAuthorization(pubkey, verificationCode, user.userId, {
        pendingAuthStore,
        pubkeyStore,
      });

      if (result.success) {
        const { sessionId } = createSession(user);
        return new Response(getAuthSuccessHtml(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Set-Cookie": createSessionCookie(sessionId),
          },
        });
      }

      return new Response(getAuthPageHtml(result.errorDescription ?? "Authorization failed"), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }

  // ==========================================================================
  // Secure Portal MCP Endpoint - /api/awp/secure (requires AWP auth)
  // ==========================================================================

  if (pathname === "/api/awp/secure" || pathname === "/api/awp/secure/mcp") {
    const authReq: AuthHttpRequest = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      text: () => req.clone().text(),
      clone: () => ({
        method: req.method,
        url: req.url,
        headers: req.headers,
        text: () => req.clone().text(),
        clone: () => authReq,
      }),
    };

    const authResult = await authMiddleware(authReq);
    if (!authResult.authorized) {
      return (
        authResult.challengeResponse ??
        new Response(
          JSON.stringify({ error: "unauthorized", error_description: "Invalid credentials" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    }
    return authPortal.handleRequest(req);
  }

  // API info
  if (pathname === "/api" || pathname === "/") {
    return new Response(
      JSON.stringify({
        name: "Agent Web Portal - Examples",
        version: "0.2.0",
        deployment: "local",
        portals: {
          basic: { endpoint: "/api/awp/basic", description: "Basic greeting portal" },
          ecommerce: { endpoint: "/api/awp/ecommerce", description: "E-commerce portal" },
          jsonata: { endpoint: "/api/awp/jsonata", description: "JSONata expression portal" },
          blob: { endpoint: "/api/awp/blob", description: "Blob portal" },
          secure: { endpoint: "/api/awp/secure", description: "Secure portal (auth required)" },
        },
        auth: {
          init: "/api/auth/init",
          status: "/api/auth/status",
          page: "/api/auth/page",
          login: "/api/auth/login",
          logout: "/api/auth/logout",
          me: "/api/auth/me",
          clients: "/api/auth/clients",
        },
        blob: {
          upload: "/api/blob/upload",
          files: "/api/blob/files",
          prepareUpload: "/api/blob/prepare-upload",
          prepareDownload: "/api/blob/prepare-download",
        },
        health: "/api/health",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // =========================================================================
  // Per-Portal Skills API - /api/awp/{portal}/skills/*
  // =========================================================================

  // Match /api/awp/{portal}/skills or /api/awp/{portal}/skills/{skillName}
  const portalSkillsMatch = pathname.match(/^\/api\/awp\/([^\/]+)\/skills(?:\/(.*))?$/);
  if (portalSkillsMatch) {
    const portalName = portalSkillsMatch[1];
    const skillPath = portalSkillsMatch[2]; // Could be undefined, a skill name, or "skillName/download"

    const currentDir = import.meta.dir;
    const portalSkillsDir = `${currentDir}/skills/${portalName}`;

    // GET /api/awp/{portal}/skills - List skills for this portal
    if (!skillPath && req.method === "GET") {
      try {
        const fs = await import("node:fs");

        if (!fs.existsSync(portalSkillsDir)) {
          return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const skillDirs = fs.readdirSync(portalSkillsDir).filter((name: string) => {
          const skillSubPath = `${portalSkillsDir}/${name}`;
          return fs.statSync(skillSubPath).isDirectory();
        });

        const skills = [];

        for (const skillName of skillDirs) {
          const skillMdPath = `${portalSkillsDir}/${skillName}/SKILL.md`;

          if (!fs.existsSync(skillMdPath)) continue;

          const content = fs.readFileSync(skillMdPath, "utf-8");
          const frontmatter = parseFrontmatter(content);

          skills.push({
            id: skillName,
            url: `/api/awp/${portalName}/skills/${skillName}`,
            zipUrl: `/api/awp/${portalName}/skills/${skillName}/download`,
            frontmatter: frontmatter || { name: skillName },
          });
        }

        return new Response(JSON.stringify(skills), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Portal skills list error:", error);
        return new Response(JSON.stringify({ error: "Failed to list skills" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // GET /api/awp/{portal}/skills/{skillName}/download - Download skill as ZIP
    if (skillPath?.endsWith("/download") && req.method === "GET") {
      const skillName = skillPath.slice(0, -"/download".length);
      const skillDir = `${portalSkillsDir}/${skillName}`;
      const tempDir = `${currentDir}/.skill-cache/${portalName}`;
      const zipPath = `${tempDir}/${skillName}.zip`;

      try {
        const fs = await import("node:fs");
        if (!fs.existsSync(skillDir)) {
          return new Response(JSON.stringify({ error: "Skill not found", skill: skillName, portal: portalName }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Check if cached zip exists and is newer than skill folder
        let needsRebuild = true;
        if (fs.existsSync(zipPath)) {
          const zipStat = fs.statSync(zipPath);
          const dirStat = fs.statSync(skillDir);

          // Get latest modification time from skill directory files
          const files = fs.readdirSync(skillDir);
          let latestMtime = dirStat.mtimeMs;
          for (const file of files) {
            const fileStat = fs.statSync(`${skillDir}/${file}`);
            if (fileStat.mtimeMs > latestMtime) {
              latestMtime = fileStat.mtimeMs;
            }
          }

          // Use cached zip if it's newer than all files
          if (zipStat.mtimeMs > latestMtime) {
            needsRebuild = false;
          }
        }

        // Build zip if needed
        if (needsRebuild) {
          console.log(`Building skill zip: ${portalName}/${skillName}`);

          const { Glob } = await import("bun");
          const glob = new Glob("**/*");

          const filesToZip: { path: string; data: Uint8Array }[] = [];

          for await (const relativePath of glob.scan({ cwd: skillDir, absolute: false })) {
            const fullPath = `${skillDir}/${relativePath}`;
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
              const data = fs.readFileSync(fullPath);
              filesToZip.push({ path: relativePath, data });
            }
          }

          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();

          for (const file of filesToZip) {
            zip.file(file.path, file.data);
          }

          const zipContent = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
          fs.writeFileSync(zipPath, zipContent);
        }

        // Return cached zip
        const zipContent = fs.readFileSync(zipPath);

        return new Response(zipContent, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${skillName}.zip"`,
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (error) {
        console.error("Portal skill download error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to download skill", message: String(error) }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  // 404
  return new Response(JSON.stringify({ error: "Not Found", path: pathname }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

// =============================================================================
// Start Server
// =============================================================================

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`
🚀 AWP Examples - Local Development Server
   URL: http://localhost:${PORT}

📡 Available Portals (MCP Endpoints):
   - /api/awp/basic     - Basic greeting portal
   - /api/awp/ecommerce - E-commerce portal  
   - /api/awp/jsonata   - JSONata expression portal
   - /api/awp/blob      - Blob portal
   - /api/awp/secure    - Secure portal (requires AWP auth)

🔐 Auth Endpoints:
   - POST /api/auth/init     - Initialize AWP auth
   - GET  /api/auth/status   - Check AWP auth status
   - GET  /api/auth/page     - Authorization page
   - POST /api/auth/complete - Complete authorization
   - POST /api/login         - Login with credentials
   - POST /api/logout        - Logout
   - GET  /api/me            - Get current user

📦 Skills (per-portal):
   - GET /api/awp/{portal}/skills - List skills
   - GET /api/awp/{portal}/skills/{name}/download - Download skill

💾 Blob Storage:
   - POST /api/blob/upload - Upload image
   - GET  /api/blob/files  - List images

👤 Test Users:
   - test / test123
   - admin / admin123
   - demo / demo

📦 Deployment:
   - bun run sam:build  - Build for SAM
   - bun run sam:deploy - Deploy to AWS

Press Ctrl+C to stop.
`);

export { server, pendingAuthStore, pubkeyStore, PORT };
