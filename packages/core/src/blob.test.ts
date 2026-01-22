import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  AWP_BLOB_MARKER,
  blob,
  extractBlobFields,
  extractToolBlobInfo,
  getBlobMetadata,
  isBlob,
} from "./blob.ts";

describe("blob()", () => {
  test("creates a string schema with blob marker", () => {
    const schema = blob();

    // Should be a valid Zod string schema
    expect(schema.parse("test")).toBe("test");

    // Should have the blob marker
    expect(AWP_BLOB_MARKER in schema).toBe(true);
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
    expect(metadata).toEqual({
      mimeType: "image/png",
      maxSize: 5 * 1024 * 1024,
      description: "Thumbnail image",
    });
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
