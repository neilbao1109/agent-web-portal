/**
 * Basic Example: Agent Web Portal with 1 Tool and 1 Skill
 *
 * This example demonstrates:
 * - Registering a local tool with Zod schemas
 * - Registering a skill that uses the tool
 * - Building the portal and starting an HTTP server
 * - Testing the MCP endpoints
 *
 * Run with: bun run examples/basic.ts
 */

import { z } from "zod";
import { createAgentWebPortal } from "../index.ts";

// =============================================================================
// 1. Define Tool Schemas
// =============================================================================

const GreetInputSchema = z.object({
  name: z.string().describe("The name of the person to greet"),
  language: z
    .enum(["en", "es", "fr", "de", "ja"])
    .optional()
    .default("en")
    .describe("The language for the greeting"),
});

const GreetOutputSchema = z.object({
  message: z.string().describe("The greeting message"),
  timestamp: z.string().describe("ISO timestamp of when the greeting was generated"),
});

// =============================================================================
// 2. Create the Agent Web Portal
// =============================================================================

const portal = createAgentWebPortal({
  name: "greeting-portal",
  version: "1.0.0",
  description: "A simple greeting service for AI Agents",
})
  // Register the greet tool
  .registerTool("greet", {
    inputSchema: GreetInputSchema,
    outputSchema: GreetOutputSchema,
    description: "Generate a greeting message in various languages",
    handler: async ({ name, language }) => {
      const greetings: Record<string, string> = {
        en: `Hello, ${name}!`,
        es: `¡Hola, ${name}!`,
        fr: `Bonjour, ${name}!`,
        de: `Hallo, ${name}!`,
        ja: `こんにちは、${name}さん！`,
      };

      return {
        message: greetings[language ?? "en"] ?? greetings.en!,
        timestamp: new Date().toISOString(),
      };
    },
  })
  // Register a skill that uses the greet tool
  .registerSkill("greeting-assistant", {
    url: "/skills/greeting-assistant.md",
    frontmatter: {
      name: "Greeting Assistant",
      description: "A skill for greeting users in multiple languages",
      version: "1.0.0",
      "allowed-tools": ["greet"],
    },
    markdown: `
# Greeting Assistant

This skill helps you greet users in their preferred language.

## Usage

Use the {{greet}} tool to generate personalized greetings.

### Supported Languages
- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Japanese (ja)

### Example
To greet a user named "Alice" in French:
\`\`\`
{{greet}} with name="Alice" and language="fr"
\`\`\`
    `.trim(),
  })
  // Build the portal (validates skills against tools)
  .build();

// =============================================================================
// 3. Start HTTP Server
// =============================================================================

const PORT = 3000;

const _server = Bun.serve({
  port: PORT,
  fetch: async (req) => {
    const url = new URL(req.url);

    // Route MCP requests to the portal
    if (url.pathname === "/mcp" || url.pathname === "/") {
      return portal.handleRequest(req);
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`
🌐 Agent Web Portal is running!
   URL: http://localhost:${PORT}

📡 MCP Endpoints:
   POST http://localhost:${PORT}/mcp

   Available methods:
   - initialize
   - tools/list
   - tools/call
   - skills/list

📋 Quick Test Commands:

   # Initialize
   curl -X POST http://localhost:${PORT}/mcp \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

   # List tools
   curl -X POST http://localhost:${PORT}/mcp \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

   # List skills
   curl -X POST http://localhost:${PORT}/mcp \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":3,"method":"skills/list"}'

   # Call greet tool
   curl -X POST http://localhost:${PORT}/mcp \\
     -H "Content-Type: application/json" \\
     -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"greet","arguments":{"name":"World","language":"es"}}}'

Press Ctrl+C to stop the server.
`);
