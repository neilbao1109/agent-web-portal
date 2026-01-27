/**
 * JSONata Portal
 *
 * Provides JSONata expression evaluation as a tool.
 */

import { createAgentWebPortal } from "@agent-web-portal/core";
import jsonata from "jsonata";
import { z } from "zod";

// =============================================================================
// Schemas
// =============================================================================

const JsonataEvalInputSchema = z.object({
  expression: z.string().describe("JSONata expression to evaluate"),
  input: z.unknown().describe("JSON input data to evaluate against"),
  bindings: z
    .record(z.unknown())
    .optional()
    .describe("Optional variable bindings for the expression"),
});

const JsonataEvalOutputSchema = z.object({
  result: z.unknown().describe("The evaluation result"),
  success: z.boolean().describe("Whether the evaluation succeeded"),
  error: z.string().optional().describe("Error message if evaluation failed"),
});

// =============================================================================
// Portal Definition
// =============================================================================

export const jsonataPortal = createAgentWebPortal({
  name: "jsonata-portal",
  version: "1.0.0",
  description: "JSONata Expression Evaluation Portal for AI Agents",
})
  .registerTool("jsonata_eval", {
    inputSchema: JsonataEvalInputSchema,
    outputSchema: JsonataEvalOutputSchema,
    description:
      "Evaluate a JSONata expression against JSON input data. " +
      "JSONata is a lightweight query and transformation language for JSON data.",
    handler: async ({ expression, input, bindings }) => {
      try {
        // Compile the JSONata expression
        const expr = jsonata(expression);

        // Evaluate with optional bindings
        const result = await expr.evaluate(input, bindings);

        return {
          result,
          success: true,
        };
      } catch (error) {
        return {
          result: null,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  })
  .registerSkills({
    "automata-transition": {
      url: "/api/awp/jsonata/skills/automata-transition/download",
      frontmatter: {
        name: "Automata State Transition",
        description: "Compute finite automaton state transitions using JSONata expressions",
        version: "1.0.0",
        "allowed-tools": ["jsonata_eval"],
      },
    },
    "statistics": {
      url: "/api/awp/jsonata/skills/statistics/download",
      frontmatter: {
        name: "Statistics Calculator",
        description: "Perform statistical calculations on record lists using JSONata",
        version: "1.0.0",
        "allowed-tools": ["jsonata_eval"],
      },
    },
  })
  .build();
