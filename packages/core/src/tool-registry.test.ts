import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { inputBlob, outputBlob } from "./blob.ts";
import { ToolRegistry } from "./tool-registry.ts";
import type { ToolRegistrationOptions } from "./types.ts";

describe("ToolRegistry", () => {
  describe("registerTool()", () => {
    test("registers a tool successfully", () => {
      const registry = new ToolRegistry();

      registry.registerTool("test_tool", {
        inputSchema: z.object({ prompt: z.string() }),
        outputSchema: z.object({ result: z.string() }),
        description: "A test tool",
        handler: async () => ({ result: "done" }),
      });

      expect(registry.getTool("test_tool")).toBeDefined();
    });

    test("throws error when registering duplicate tool name", () => {
      const registry = new ToolRegistry();

      registry.registerTool("test_tool", {
        inputSchema: z.object({ prompt: z.string() }),
        outputSchema: z.object({ result: z.string() }),
        description: "A test tool",
        handler: async () => ({ result: "done" }),
      });

      expect(() => {
        registry.registerTool("test_tool", {
          inputSchema: z.object({ prompt: z.string() }),
          outputSchema: z.object({ result: z.string() }),
          description: "Duplicate tool",
          handler: async () => ({ result: "done" }),
        });
      }).toThrow('Tool "test_tool" is already registered');
    });

    test("allows distinct input and output blob field names", () => {
      const registry = new ToolRegistry();

      // This should work - different field names
      // Note: handler returns empty object since blob fields are filled by registry
      // Using 'as any' because the actual handler type expects blob fields to be present,
      // but at runtime they are automatically filled by the registry
      registry.registerTool("image_tool", {
        inputSchema: z.object({
          source: inputBlob({ mimeType: "image/*", description: "Source image" }),
        }),
        outputSchema: z.object({
          result: outputBlob({ accept: "image/png", description: "Result image" }),
        }),
        description: "An image processing tool",
        handler: (async () => ({})) as any,
      });

      expect(registry.getTool("image_tool")).toBeDefined();
    });

    test("throws error when input and output blob fields have the same name", () => {
      const registry = new ToolRegistry();

      expect(() => {
        registry.registerTool("image_tool", {
          inputSchema: z.object({
            image: inputBlob({ mimeType: "image/*", description: "Source image" }),
          }),
          outputSchema: z.object({
            image: outputBlob({ accept: "image/png", description: "Result image" }),
          }),
          description: "A tool with blob name collision",
          handler: (async () => ({})) as any,
        });
      }).toThrow('Tool "image_tool" has blob field name collision between input and output: image');
    });

    test("throws error listing all colliding field names", () => {
      const registry = new ToolRegistry();

      expect(() => {
        registry.registerTool("multi_blob_tool", {
          inputSchema: z.object({
            image: inputBlob({ mimeType: "image/*", description: "Source image" }),
            mask: inputBlob({ mimeType: "image/*", description: "Mask image" }),
          }),
          outputSchema: z.object({
            image: outputBlob({ accept: "image/png", description: "Result image" }),
            mask: outputBlob({ accept: "image/png", description: "Result mask" }),
          }),
          description: "A tool with multiple blob collisions",
          handler: (async () => ({})) as any,
        });
      }).toThrow("image, mask");
    });
  });

  describe("toMcpSchema()", () => {
    test("includes both input and output blobs in inputSchema properties", () => {
      const registry = new ToolRegistry();

      registry.registerTool("image_edit", {
        inputSchema: z.object({
          source: inputBlob({ mimeType: "image/*", description: "Source image" }),
          prompt: z.string().describe("Edit prompt"),
        }),
        outputSchema: z.object({
          result: outputBlob({ accept: "image/png", description: "Result image" }),
          metadata: z.object({ width: z.number() }),
        }),
        description: "Edit an image",
        handler: (async () => ({ metadata: { width: 0 } })) as any,
      });

      const schema = registry.toMcpSchema("image_edit");

      expect(schema).toBeDefined();
      expect(schema!.inputSchema.properties).toHaveProperty("source");
      expect(schema!.inputSchema.properties).toHaveProperty("result");
      expect(schema!.inputSchema.properties).toHaveProperty("prompt");

      // Blob fields should be in required array
      expect(schema!.inputSchema.required).toContain("source");
      expect(schema!.inputSchema.required).toContain("result");
    });

    test("includes _awp.blob extension with correct kind", () => {
      const registry = new ToolRegistry();

      registry.registerTool("image_edit", {
        inputSchema: z.object({
          source: inputBlob({ mimeType: "image/*", description: "Source image" }),
        }),
        outputSchema: z.object({
          result: outputBlob({ accept: "image/png", description: "Result image" }),
        }),
        description: "Edit an image",
        handler: (async () => ({})) as any,
      });

      const schema = registry.toMcpSchema("image_edit");

      expect(schema!._awp).toBeDefined();
      expect(schema!._awp!.blob).toBeDefined();
      expect(schema!._awp!.blob!.source).toEqual({
        kind: "input",
        description: "Source image",
      });
      expect(schema!._awp!.blob!.result).toEqual({
        kind: "output",
        description: "Result image",
      });
    });
  });
});
