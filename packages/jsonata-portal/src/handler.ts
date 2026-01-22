/**
 * JSONata Portal - Lambda Handler
 *
 * A Lambda-based Agent Web Portal that provides JSONata expression evaluation.
 *
 * Tool:
 * - jsonata_eval: Evaluate JSONata expressions against JSON input
 *
 * Skills:
 * - automata-transition: Use JSONata for finite automaton state transitions
 * - statistics: Use JSONata for statistical calculations on record lists
 */

import { createAgentWebPortalHandler, type SkillsConfig } from "@agent-web-portal/aws-lambda";
import jsonata from "jsonata";
import { z } from "zod";

// =============================================================================
// Tool Schemas
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
// Skills Configuration
// =============================================================================

const skillsConfig: SkillsConfig = {
  bucket: process.env.SKILLS_BUCKET ?? "my-awp-skills-bucket",
  prefix: "skills/",
  skills: [
    {
      name: "automata-transition",
      s3Key: "automata-transition.zip",
      frontmatter: {
        name: "Automata State Transition",
        description:
          "Compute finite automaton state transitions using JSONata expressions. " +
          "Given a current state, an input symbol, and a transition table, " +
          "calculates the next state.",
        version: "1.0.0",
        "allowed-tools": ["jsonata_eval"],
      },
    },
    {
      name: "statistics",
      s3Key: "statistics.zip",
      frontmatter: {
        name: "Statistics Calculator",
        description:
          "Perform statistical calculations on record lists using JSONata. " +
          "Supports aggregations like sum, average, count, min, max, " +
          "and grouping operations.",
        version: "1.0.0",
        "allowed-tools": ["jsonata_eval"],
      },
    },
  ],
};

// =============================================================================
// Lambda Handler
// =============================================================================

export const handler = createAgentWebPortalHandler({
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

        // Evaluate with optional bindings (input is already preprocessed by schema)
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
  .withSkillsConfig(skillsConfig)
  .build({
    // Enable coercion for XML-based MCP clients that serialize all args as strings
    coerceXmlClientArgs: true,
  });
