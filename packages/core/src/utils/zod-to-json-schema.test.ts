import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { blob } from "../blob.ts";
import { zodToJsonSchema } from "./zod-to-json-schema.ts";

describe("zodToJsonSchema with blob support", () => {
  test("converts blob schema to JSON Schema with x-awp-blob extension", () => {
    const schema = blob({ mimeType: "application/pdf" });
    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema).toEqual({
      type: "string",
      format: "uri",
      "x-awp-blob": {
        mimeType: "application/pdf",
      },
    });
  });

  test("includes all blob options in x-awp-blob", () => {
    const schema = blob({
      mimeType: "image/png",
      maxSize: 10 * 1024 * 1024,
      description: "Thumbnail image",
    });
    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema).toEqual({
      type: "string",
      format: "uri",
      "x-awp-blob": {
        mimeType: "image/png",
        maxSize: 10 * 1024 * 1024,
        description: "Thumbnail image",
      },
    });
  });

  test("handles object schema with blob fields", () => {
    const schema = z.object({
      document: blob({ mimeType: "application/pdf" }),
      name: z.string(),
      count: z.number(),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema).toEqual({
      type: "object",
      properties: {
        document: {
          type: "string",
          format: "uri",
          "x-awp-blob": {
            mimeType: "application/pdf",
          },
        },
        name: { type: "string" },
        count: { type: "number" },
      },
      required: ["document", "name", "count"],
    });
  });

  test("handles optional blob fields", () => {
    const schema = z.object({
      document: blob({ mimeType: "application/pdf" }).optional(),
      name: z.string(),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema).toEqual({
      type: "object",
      properties: {
        document: {
          type: "string",
          format: "uri",
          "x-awp-blob": {
            mimeType: "application/pdf",
          },
        },
        name: { type: "string" },
      },
      required: ["name"],
    });
  });

  test("handles array of blobs", () => {
    const schema = z.object({
      images: z.array(blob({ mimeType: "image/*" })),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema).toEqual({
      type: "object",
      properties: {
        images: {
          type: "array",
          items: {
            type: "string",
            format: "uri",
            "x-awp-blob": {
              mimeType: "image/*",
            },
          },
        },
      },
      required: ["images"],
    });
  });

  test("blob without options generates empty x-awp-blob object", () => {
    const schema = blob();
    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema).toEqual({
      type: "string",
      format: "uri",
      "x-awp-blob": {},
    });
  });
});
