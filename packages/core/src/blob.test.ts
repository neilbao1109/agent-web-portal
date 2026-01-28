import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  AWP_BLOB_MARKER,
  blob,
  extractBlobDescriptors,
  extractBlobFields,
  extractBlobFieldsByDirection,
  extractCombinedBlobDescriptors,
  extractToolBlobInfo,
  getBlobMetadata,
  inputBlob,
  isBlob,
  outputBlob,
} from "./blob.ts";

describe("inputBlob()", () => {
  test("creates a string schema with input blob marker", () => {
    const schema = inputBlob({ description: "A PDF document" });

    // Should be a valid Zod string schema
    expect(schema.parse("test")).toBe("test");

    // Should have the blob marker
    expect(AWP_BLOB_MARKER in schema).toBe(true);
  });

  test("has direction set to input", () => {
    const schema = inputBlob({ description: "A PDF document" });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.direction).toBe("input");
  });

  test("stores description", () => {
    const schema = inputBlob({ description: "A PDF document" });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.description).toBe("A PDF document");
  });

  test("stores mimeType option", () => {
    const schema = inputBlob({
      description: "A PDF document",
      mimeType: "application/pdf",
    });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.mimeType).toBe("application/pdf");
  });

  test("stores maxSize option", () => {
    const schema = inputBlob({
      description: "A PDF document",
      maxSize: 1024 * 1024,
    });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.maxSize).toBe(1024 * 1024);
  });
});

describe("outputBlob()", () => {
  test("creates a string schema with output blob marker", () => {
    const schema = outputBlob({ description: "Generated thumbnail" });

    // Should be a valid Zod string schema
    expect(schema.parse("test")).toBe("test");

    // Should have the blob marker
    expect(AWP_BLOB_MARKER in schema).toBe(true);
  });

  test("has direction set to output", () => {
    const schema = outputBlob({ description: "Generated thumbnail" });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.direction).toBe("output");
  });

  test("stores description", () => {
    const schema = outputBlob({ description: "Generated thumbnail" });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.description).toBe("Generated thumbnail");
  });

  test("stores accept as mimeType", () => {
    const schema = outputBlob({
      description: "Generated thumbnail",
      accept: "image/png",
    });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.mimeType).toBe("image/png");
  });
});

describe("blob() (legacy)", () => {
  test("creates a string schema with blob marker", () => {
    const schema = blob();

    // Should be a valid Zod string schema
    expect(schema.parse("test")).toBe("test");

    // Should have the blob marker
    expect(AWP_BLOB_MARKER in schema).toBe(true);
  });

  test("defaults to input direction", () => {
    const schema = blob();

    const metadata = getBlobMetadata(schema);
    expect(metadata?.direction).toBe("input");
  });

  test("stores mimeType option", () => {
    const schema = blob({ mimeType: "application/pdf" });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.mimeType).toBe("application/pdf");
  });

  test("stores maxSize option", () => {
    const schema = blob({ maxSize: 1024 * 1024 });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.maxSize).toBe(1024 * 1024);
  });

  test("stores description option", () => {
    const schema = blob({ description: "A PDF document" });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.description).toBe("A PDF document");
  });

  test("stores all options together", () => {
    const schema = blob({
      mimeType: "image/png",
      maxSize: 5 * 1024 * 1024,
      description: "Thumbnail image",
    });

    const metadata = getBlobMetadata(schema);
    expect(metadata?.direction).toBe("input");
    expect(metadata?.mimeType).toBe("image/png");
    expect(metadata?.maxSize).toBe(5 * 1024 * 1024);
    expect(metadata?.description).toBe("Thumbnail image");
  });
});

describe("isBlob()", () => {
  test("returns true for blob schemas", () => {
    const schema = blob();
    expect(isBlob(schema)).toBe(true);
  });

  test("returns false for regular string schemas", () => {
    const schema = z.string();
    expect(isBlob(schema)).toBe(false);
  });

  test("returns false for other types", () => {
    expect(isBlob(null)).toBe(false);
    expect(isBlob(undefined)).toBe(false);
    expect(isBlob("string")).toBe(false);
    expect(isBlob(123)).toBe(false);
    expect(isBlob({})).toBe(false);
  });
});

describe("getBlobMetadata()", () => {
  test("returns metadata for blob schemas", () => {
    const schema = blob({ mimeType: "text/plain" });
    const metadata = getBlobMetadata(schema);

    expect(metadata).toBeDefined();
    expect(metadata?.mimeType).toBe("text/plain");
  });

  test("returns undefined for non-blob schemas", () => {
    const schema = z.string();
    const metadata = getBlobMetadata(schema);

    expect(metadata).toBeUndefined();
  });
});

describe("extractBlobFields()", () => {
  test("extracts blob fields from object schema", () => {
    const schema = z.object({
      document: blob({ mimeType: "application/pdf" }),
      name: z.string(),
      thumbnail: blob({ mimeType: "image/png" }),
      size: z.number(),
    });

    const fields = extractBlobFields(schema);

    expect(fields).toContain("document");
    expect(fields).toContain("thumbnail");
    expect(fields).not.toContain("name");
    expect(fields).not.toContain("size");
    expect(fields.length).toBe(2);
  });

  test("returns empty array for schema without blobs", () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    });

    const fields = extractBlobFields(schema);
    expect(fields).toEqual([]);
  });

  test("handles optional blob fields", () => {
    const schema = z.object({
      document: blob().optional(),
      name: z.string(),
    });

    const fields = extractBlobFields(schema);
    expect(fields).toContain("document");
  });

  test("returns empty array for non-object schemas", () => {
    const schema = z.string();
    const fields = extractBlobFields(schema);
    expect(fields).toEqual([]);
  });
});

describe("extractToolBlobInfo()", () => {
  test("extracts blob info from input and output schemas", () => {
    const inputSchema = z.object({
      document: blob({ mimeType: "application/pdf" }),
      options: z.object({ quality: z.number() }),
    });

    const outputSchema = z.object({
      thumbnail: blob({ mimeType: "image/png" }),
      preview: blob({ mimeType: "image/png" }),
      metadata: z.object({ pageCount: z.number() }),
    });

    const info = extractToolBlobInfo(inputSchema, outputSchema);

    expect(info.inputBlobs).toEqual(["document"]);
    expect(info.outputBlobs).toContain("thumbnail");
    expect(info.outputBlobs).toContain("preview");
    expect(info.outputBlobs.length).toBe(2);
  });

  test("handles schemas without blobs", () => {
    const inputSchema = z.object({ name: z.string() });
    const outputSchema = z.object({ result: z.string() });

    const info = extractToolBlobInfo(inputSchema, outputSchema);

    expect(info.inputBlobs).toEqual([]);
    expect(info.outputBlobs).toEqual([]);
  });
});

describe("extractBlobDescriptors()", () => {
  test("extracts descriptors with kind and description from input blobs", () => {
    const schema = z.object({
      document: inputBlob({ description: "Input PDF document", mimeType: "application/pdf" }),
      name: z.string(),
    });

    const descriptors = extractBlobDescriptors(schema);

    expect(descriptors.document).toBeDefined();
    expect(descriptors.document!.kind).toBe("input");
    expect(descriptors.document!.description).toBe("Input PDF document");
    expect(descriptors.name).toBeUndefined();
  });

  test("extracts descriptors with kind and description from output blobs", () => {
    const schema = z.object({
      thumbnail: outputBlob({ description: "Generated thumbnail", accept: "image/png" }),
      name: z.string(),
    });

    const descriptors = extractBlobDescriptors(schema);

    expect(descriptors.thumbnail).toBeDefined();
    expect(descriptors.thumbnail!.kind).toBe("output");
    expect(descriptors.thumbnail!.description).toBe("Generated thumbnail");
    expect(descriptors.name).toBeUndefined();
  });

  test("handles mixed input and output blobs", () => {
    const schema = z.object({
      source: inputBlob({ description: "Source image" }),
      result: outputBlob({ description: "Result image" }),
    });

    const descriptors = extractBlobDescriptors(schema);

    expect(descriptors.source!.kind).toBe("input");
    expect(descriptors.result!.kind).toBe("output");
  });
});

describe("extractBlobFieldsByDirection()", () => {
  test("extracts only input blobs", () => {
    const schema = z.object({
      source: inputBlob({ description: "Source image" }),
      result: outputBlob({ description: "Result image" }),
      name: z.string(),
    });

    const inputFields = extractBlobFieldsByDirection(schema, "input");

    expect(inputFields).toContain("source");
    expect(inputFields).not.toContain("result");
    expect(inputFields.length).toBe(1);
  });

  test("extracts only output blobs", () => {
    const schema = z.object({
      source: inputBlob({ description: "Source image" }),
      result: outputBlob({ description: "Result image" }),
      name: z.string(),
    });

    const outputFields = extractBlobFieldsByDirection(schema, "output");

    expect(outputFields).toContain("result");
    expect(outputFields).not.toContain("source");
    expect(outputFields.length).toBe(1);
  });

  test("handles legacy blob() as input", () => {
    const schema = z.object({
      legacyBlob: blob({ description: "Legacy blob" }),
    });

    const inputFields = extractBlobFieldsByDirection(schema, "input");
    const outputFields = extractBlobFieldsByDirection(schema, "output");

    expect(inputFields).toContain("legacyBlob");
    expect(outputFields.length).toBe(0);
  });
});

describe("extractCombinedBlobDescriptors()", () => {
  test("combines descriptors from input and output schemas", () => {
    const inputSchema = z.object({
      source: inputBlob({ description: "Source image" }),
      options: z.object({ quality: z.number() }),
    });

    const outputSchema = z.object({
      result: outputBlob({ description: "Result image" }),
      metadata: z.object({ width: z.number() }),
    });

    const combined = extractCombinedBlobDescriptors(inputSchema, outputSchema);

    expect(combined.source).toBeDefined();
    expect(combined.source!.kind).toBe("input");
    expect(combined.source!.description).toBe("Source image");

    expect(combined.result).toBeDefined();
    expect(combined.result!.kind).toBe("output");
    expect(combined.result!.description).toBe("Result image");

    expect(combined.options).toBeUndefined();
    expect(combined.metadata).toBeUndefined();
  });

  test("returns empty object for schemas without blobs", () => {
    const inputSchema = z.object({ name: z.string() });
    const outputSchema = z.object({ result: z.string() });

    const combined = extractCombinedBlobDescriptors(inputSchema, outputSchema);

    expect(Object.keys(combined).length).toBe(0);
  });
});
