# Agent Web Portal (AWP)

A scene-oriented, MCP-compatible framework that exposes site functionality to AI Agents in a structured way.

**AWP = Controller + Skills + Tools**

## Features

- 🔌 **MCP Compatible**: Works with standard MCP Agents out of the box
- 🎯 **Skill-Focused**: Extends MCP with scene-oriented skill capabilities
- 📝 **Zod Validation**: Full input/output validation using Zod schemas
- 🔗 **Cross-MCP Support**: Reference tools from other MCP servers
- ✅ **Build-time Validation**: Ensures all skill dependencies are satisfied
- 🚀 **Bun/Node Ready**: Works with modern JavaScript runtimes
- 🔐 **Flexible Auth**: OAuth 2.0 (RFC 9728), HMAC, API Key authentication
- 📦 **Blob Handling**: Presigned URL-based binary data exchange

## Installation

```bash
bun install
```

## Quick Start

```typescript
import { z } from "zod";
import { createAgentWebPortal } from "agent-web-portal";

// Create portal with tools and skills
const portal = createAgentWebPortal({ name: "my-site" })
  .registerTool("greet", {
    inputSchema: z.object({ name: z.string() }),
    outputSchema: z.object({ message: z.string() }),
    description: "Generate a greeting",
    handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
  })
  .registerSkills({
    "greeting-skill": {
      url: "/skills/greeting-skill",
      frontmatter: {
        name: "Greeting Skill",
        "allowed-tools": ["greet"],
      },
    },
  })
  .build();

// Start server with Bun
Bun.serve({
  port: 3000,
  fetch: (req) => portal.handleRequest(req),
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Agent Web Portal                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Tools     │  │   Skills    │  │  HTTP Handler   │  │
│  │  Registry   │  │  Registry   │  │  (MCP + AWP)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    MCP Protocol Layer                    │
│  • initialize    • tools/list    • tools/call           │
│  • skills/list (AWP extension)                          │
└─────────────────────────────────────────────────────────┘
```

## API Reference

### `createAgentWebPortal(options?)`

Creates a new AgentWebPortal builder.

```typescript
const builder = createAgentWebPortal({
  name: "my-portal",      // Server name
  version: "1.0.0",       // Server version
  description: "...",     // Server description
});
```

### `.registerTool(name, options)`

Register a tool with Zod schemas and handler.

```typescript
builder.registerTool("search", {
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().optional().default(10),
  }),
  outputSchema: z.object({
    results: z.array(z.string()),
  }),
  description: "Search for items",
  handler: async ({ query, limit }) => {
    // Implementation
    return { results: ["item1", "item2"] };
  },
});
```

### `.registerSkills(skills)`

Register multiple skills at once with URLs and frontmatter.
Each skill's markdown content should be served at its specified URL.

```typescript
builder.registerSkills({
  "search-assistant": {
    url: "/skills/search-assistant",
    frontmatter: {
      name: "Search Assistant",
      description: "Help users search",
      version: "1.0.0",
      "allowed-tools": ["search", "external_mcp:analyze"],
    },
  },
});
```

### `.build()`

Build the portal instance. Validates all skills against registered tools.

```typescript
const portal = builder.build();
// Throws SkillValidationError if any local tool dependency is missing
```

### Portal Instance Methods

```typescript
// Handle HTTP requests (MCP endpoint)
portal.handleRequest(request: Request): Promise<Response>

// List all tools (MCP format)
portal.listTools(): McpToolsListResponse

// List all skills with frontmatter (AWP extension)
portal.listSkills(): SkillsListResponse

// Invoke a tool directly
portal.invokeTool(name: string, args: unknown): Promise<unknown>
```

## MCP Endpoints

AWP exposes a JSON-RPC 2.0 compatible endpoint:

### `initialize`

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize"
}
```

### `tools/list`

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

### `tools/call`

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "greet",
    "arguments": { "name": "World" }
  }
}
```

### `skills/list` (AWP Extension)

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "skills/list"
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "greeting-skill": {
      "url": "/skills/greeting.md",
      "frontmatter": {
        "name": "Greeting Skill",
        "allowed-tools": ["greet"]
      }
    }
  }
}
```

## Skill Frontmatter

Skills support the following frontmatter properties:

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Human-readable skill name |
| `description` | `string` | Skill description |
| `version` | `string` | Skill version |
| `allowed-tools` | `string[]` | List of tools this skill can use |

### Tool References

Tools can be referenced in two formats:

- **Local tools**: `tool_name`
- **Cross-MCP tools**: `mcp_alias:tool_name`

```typescript
frontmatter: {
  "allowed-tools": [
    "local_search",           // Local tool
    "external_api:fetch",     // Cross-MCP tool
  ]
}
```

## Packages

| Package | Description |
|---------|-------------|
| `@agent-web-portal/core` | Core framework: Portal, Tools, Skills, HTTP Handler |
| `@agent-web-portal/auth` | Authentication middleware (OAuth 2.0, HMAC, API Key) |
| `@agent-web-portal/client` | Client SDK with blob handling and auth support |
| `@agent-web-portal/aws-lambda` | AWS Lambda adapter |
| `@agent-web-portal/aws-cli` | CLI for deploying Skills |

## Authentication

AWP supports multiple authentication schemes:

```typescript
import { createAuthMiddleware } from "@agent-web-portal/auth";

const auth = createAuthMiddleware({
  schemes: [
    {
      type: "oauth2",
      resourceMetadata: {
        resource: "https://api.example.com/mcp",
        authorization_servers: ["https://auth.example.com"],
      },
      validateToken: async (token) => {
        // Validate JWT token
        return { valid: true, claims: { sub: "user-123" } };
      },
    },
    {
      type: "api_key",
      header: "X-API-Key",
      validateKey: async (key) => ({
        valid: key === process.env.API_KEY,
      }),
    },
  ],
});

Bun.serve({
  port: 3000,
  fetch: async (req) => {
    const result = await auth(req);
    if (!result.authorized) {
      return result.challengeResponse!;
    }
    return portal.handleRequest(req);
  },
});
```

## Blob Handling

AWP supports binary data exchange via presigned URLs:

```typescript
import { blob, createAgentWebPortal } from "@agent-web-portal/core";
import { z } from "zod";

const portal = createAgentWebPortal({ name: "blob-portal" })
  .registerTool("process_document", {
    inputSchema: z.object({
      document: blob({ mimeType: "application/pdf" }),
      quality: z.number().min(1).max(100),
    }),
    outputSchema: z.object({
      thumbnail: blob({ mimeType: "image/png" }),
      pageCount: z.number(),
    }),
    handler: async ({ quality }, context) => {
      // Access input blob via presigned GET URL
      const pdfData = await fetch(context.blobs.input.document);
      
      // Write output blob via presigned PUT URL
      await fetch(context.blobs.output.thumbnail, {
        method: "PUT",
        body: thumbnailData,
      });
      
      return { pageCount: 10, thumbnail: "" };
    },
  })
  .build();
```

## Examples

Run the examples:

```bash
# Basic example (1 tool, 1 skill)
bun run examples/basic.ts

# Advanced example (multiple tools, cross-MCP references)
bun run examples/advanced.ts

# Run E2E tests (includes auth and blob handling)
bun test packages/examples/e2e.test.ts
```

## Error Handling

AWP provides typed errors for common scenarios:

```typescript
import {
  ToolNotFoundError,
  SkillValidationError,
  ToolValidationError,
} from "agent-web-portal";

try {
  const portal = builder.build();
} catch (error) {
  if (error instanceof SkillValidationError) {
    console.error("Missing tools:", error.message);
  }
}
```

## License

MIT
