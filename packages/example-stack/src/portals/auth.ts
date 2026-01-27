/**
 * Auth Portal
 *
 * Demonstrates AWP authentication with secure tools.
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

export const authPortal = createAgentWebPortal({
  name: "auth-portal",
  version: "1.0.0",
  description: "Auth-enabled portal for testing AWP authentication",
})
  .registerTool("secure_greet", {
    inputSchema: GreetInputSchema,
    outputSchema: GreetOutputSchema,
    description: "A secure greeting that requires authentication",
    handler: async ({ name, language }) => {
      const greetings: Record<string, string> = {
        en: `Hello, ${name}! (authenticated)`,
        es: `¡Hola, ${name}! (autenticado)`,
        fr: `Bonjour, ${name}! (authentifié)`,
        de: `Hallo, ${name}! (authentifiziert)`,
        ja: `こんにちは、${name}さん！(認証済み)`,
      };

      return {
        message: greetings[language ?? "en"] ?? greetings.en!,
        timestamp: new Date().toISOString(),
      };
    },
  })
  .build();
