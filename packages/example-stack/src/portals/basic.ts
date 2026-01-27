/**
 * Basic Greeting Portal
 *
 * A simple greeting service demonstrating basic AWP functionality.
 */

import { createAgentWebPortal } from "@agent-web-portal/core";
import { z } from "zod";

// =============================================================================
// Schemas
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
// Portal Definition
// =============================================================================

export const basicPortal = createAgentWebPortal({
  name: "greeting-portal",
  version: "1.0.0",
  description: "A simple greeting service for AI Agents",
})
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
  .build();
