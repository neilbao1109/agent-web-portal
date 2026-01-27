/**
 * Blob Portal - Image Storage Example
 *
 * Demonstrates AWP blob handling with image upload/download functionality.
 * This example shows:
 * - put_image: blob INPUT (tool reads from presigned GET URL)
 * - get_image: blob OUTPUT (tool writes to presigned PUT URL)
 * - list_images: no blobs
 *
 * Images are stored in S3 with a 1 day TTL.
 * Temporary upload URLs have a 5 minute TTL.
 */

import { blob, createAgentWebPortal } from "@agent-web-portal/core";
import { z } from "zod";
import {
  getStoredImageS3,
  isS3BlobStorageConfigured,
  listStoredImagesS3,
  storeImageS3,
  writeOutputBlobS3,
} from "./blob-s3.ts";

// =============================================================================
// Blob Handler Call Tracking (for testing)
// =============================================================================

export interface BlobHandlerCall {
  toolName: string;
  inputBlobs: Record<string, string>;
  outputBlobs: Record<string, string>;
}

const blobHandlerCalls: BlobHandlerCall[] = [];

export function recordBlobHandlerCall(call: BlobHandlerCall): void {
  blobHandlerCalls.push(call);
}

export function getBlobHandlerCalls(): BlobHandlerCall[] {
  return blobHandlerCalls;
}

export function clearBlobHandlerCalls(): void {
  blobHandlerCalls.length = 0;
}

// =============================================================================
// In-Memory Image Store
// =============================================================================

interface StoredImage {
  key: string;
  contentType: string;
  data: ArrayBuffer;
  uploadedAt: string;
  expiresAt: string;
}

const imageStore = new Map<string, StoredImage>();

// Default TTL: 1 day in milliseconds
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Generate a unique key for an image
 * Format: images/{date}/{timestamp}-{random}
 */
function generateImageKey(): string {
  const date = new Date();
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
  const timestamp = date.getTime();
  const random = Math.random().toString(36).substring(2, 10);
  return `images/${dateStr}/${timestamp}-${random}`;
}

/**
 * Clean up expired images
 */
function cleanupExpiredImages(): void {
  const now = new Date();
  for (const [key, image] of imageStore.entries()) {
    if (new Date(image.expiresAt) < now) {
      imageStore.delete(key);
    }
  }
}

/**
 * Store an image in memory
 */
export function storeImage(
  data: ArrayBuffer,
  contentType: string,
  key?: string
): { key: string; uploadedAt: string; expiresAt: string } {
  cleanupExpiredImages();

  const imageKey = key ?? generateImageKey();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_TTL_MS);

  const storedImage: StoredImage = {
    key: imageKey,
    contentType,
    data,
    uploadedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  imageStore.set(imageKey, storedImage);

  return {
    key: imageKey,
    uploadedAt: storedImage.uploadedAt,
    expiresAt: storedImage.expiresAt,
  };
}

/**
 * Get an image from memory
 */
export function getStoredImage(
  key: string
): { data: ArrayBuffer; contentType: string; uploadedAt: string; expiresAt: string } | null {
  cleanupExpiredImages();

  const image = imageStore.get(key);
  if (!image) {
    return null;
  }

  if (new Date(image.expiresAt) < new Date()) {
    imageStore.delete(key);
    return null;
  }

  return {
    data: image.data,
    contentType: image.contentType,
    uploadedAt: image.uploadedAt,
    expiresAt: image.expiresAt,
  };
}

/**
 * List all stored images (metadata only)
 */
export function listStoredImages(): Array<{
  key: string;
  contentType: string;
  uploadedAt: string;
  expiresAt: string;
}> {
  cleanupExpiredImages();

  return Array.from(imageStore.values()).map((img) => ({
    key: img.key,
    contentType: img.contentType,
    uploadedAt: img.uploadedAt,
    expiresAt: img.expiresAt,
  }));
}

// =============================================================================
// Temporary Upload Store (5 minute TTL)
// =============================================================================

interface TempUpload {
  id: string;
  data: ArrayBuffer;
  contentType: string;
  createdAt: number;
  expiresAt: number;
}

const tempUploadStore = new Map<string, TempUpload>();
const TEMP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Store a temporary upload (for prepare-upload API)
 */
export function storeTempUpload(
  data: ArrayBuffer,
  contentType: string
): { id: string; readUrl: string; expiresAt: string } {
  // Clean up expired temp uploads
  const now = Date.now();
  for (const [id, upload] of tempUploadStore.entries()) {
    if (upload.expiresAt < now) {
      tempUploadStore.delete(id);
    }
  }

  const id = `temp-${now}-${Math.random().toString(36).substring(2, 10)}`;
  const expiresAt = now + TEMP_TTL_MS;

  tempUploadStore.set(id, {
    id,
    data,
    contentType,
    createdAt: now,
    expiresAt,
  });

  return {
    id,
    readUrl: `/blob/temp/${id}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/**
 * Get a temporary upload
 */
export function getTempUpload(id: string): { data: ArrayBuffer; contentType: string } | null {
  const upload = tempUploadStore.get(id);
  if (!upload) {
    return null;
  }

  if (upload.expiresAt < Date.now()) {
    tempUploadStore.delete(id);
    return null;
  }

  return {
    data: upload.data,
    contentType: upload.contentType,
  };
}

// =============================================================================
// Output Blob Store (for get_image to write to)
// =============================================================================

interface OutputBlob {
  id: string;
  data?: ArrayBuffer;
  contentType?: string;
  createdAt: number;
  expiresAt: number;
}

const outputBlobStore = new Map<string, OutputBlob>();
const OUTPUT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a placeholder for output blob (for prepare-download API)
 */
export function createOutputBlobSlot(): {
  id: string;
  writeUrl: string;
  readUrl: string;
  expiresAt: string;
} {
  // Clean up expired output blobs
  const now = Date.now();
  for (const [id, blob] of outputBlobStore.entries()) {
    if (blob.expiresAt < now) {
      outputBlobStore.delete(id);
    }
  }

  const id = `output-${now}-${Math.random().toString(36).substring(2, 10)}`;
  const expiresAt = now + OUTPUT_TTL_MS;

  outputBlobStore.set(id, {
    id,
    createdAt: now,
    expiresAt,
  });

  return {
    id,
    writeUrl: `/blob/output/${id}`,
    readUrl: `/blob/output/${id}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/**
 * Write data to output blob slot
 */
export function writeOutputBlob(id: string, data: ArrayBuffer, contentType: string): boolean {
  const blob = outputBlobStore.get(id);
  if (!blob || blob.expiresAt < Date.now()) {
    return false;
  }

  blob.data = data;
  blob.contentType = contentType;
  return true;
}

/**
 * Read data from output blob
 */
export function readOutputBlob(id: string): { data: ArrayBuffer; contentType: string } | null {
  const blob = outputBlobStore.get(id);
  if (!blob || blob.expiresAt < Date.now() || !blob.data) {
    return null;
  }

  return {
    data: blob.data,
    contentType: blob.contentType ?? "application/octet-stream",
  };
}

// =============================================================================
// Schemas
// =============================================================================

const PutImageInputSchema = z.object({
  image: blob({
    mimeType: "image/*",
    description: "Image file to upload (passed as presigned GET URL)",
  }),
  contentType: z
    .string()
    .optional()
    .describe("MIME type of the image (e.g., image/png, image/jpeg)"),
});

const PutImageOutputSchema = z.object({
  key: z.string().describe("Unique key to retrieve the image"),
  uploadedAt: z.string().describe("Upload timestamp (ISO 8601)"),
  expiresAt: z.string().describe("Expiration timestamp (ISO 8601)"),
});

const GetImageInputSchema = z.object({
  key: z.string().describe("The image key (from put_image or list_images)"),
});

const GetImageOutputSchema = z.object({
  image: blob({
    mimeType: "image/*",
    description: "The retrieved image file (written to presigned PUT URL)",
  }),
  contentType: z.string().describe("MIME type of the image"),
  uploadedAt: z.string().describe("Original upload timestamp"),
  expiresAt: z.string().describe("Expiration timestamp"),
});

const ImageInfoSchema = z.object({
  key: z.string(),
  contentType: z.string(),
  uploadedAt: z.string(),
  expiresAt: z.string(),
});

// =============================================================================
// Portal Definition
// =============================================================================

export const blobPortal = createAgentWebPortal({
  name: "blob-portal",
  version: "1.0.0",
  description: "Image storage portal demonstrating AWP blob input/output capabilities",
})
  .registerTool("put_image", {
    inputSchema: PutImageInputSchema,
    outputSchema: PutImageOutputSchema,
    description: "Upload an image to storage. The image is read from the provided presigned URL.",
    handler: async ({ contentType }, context) => {
      // Record the blob URLs for testing
      recordBlobHandlerCall({
        toolName: "put_image",
        inputBlobs: context?.blobs.input ?? {},
        outputBlobs: context?.blobs.output ?? {},
      });

      // Get the presigned GET URL for the input image
      const inputUrl = context?.blobs.input.image;
      if (!inputUrl) {
        throw new Error("No input image URL provided");
      }

      // Fetch the image data from the presigned URL
      const response = await fetch(inputUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const data = await response.arrayBuffer();
      const detectedContentType =
        response.headers.get("content-type") ?? contentType ?? "image/png";

      // Store the image to S3
      if (isS3BlobStorageConfigured()) {
        const result = await storeImageS3(data, detectedContentType);
        return result;
      }

      // Fallback to memory storage
      const result = storeImage(data, detectedContentType);
      return result;
    },
  })
  .registerTool("get_image", {
    inputSchema: GetImageInputSchema,
    outputSchema: GetImageOutputSchema,
    description: "Retrieve a previously uploaded image by its key",
    handler: async ({ key }, context) => {
      // Record the blob URLs for testing
      recordBlobHandlerCall({
        toolName: "get_image",
        inputBlobs: context?.blobs.input ?? {},
        outputBlobs: context?.blobs.output ?? {},
      });

      // Look up the image (try S3 first, then memory)
      let storedImage: {
        data: ArrayBuffer;
        contentType: string;
        uploadedAt: string;
        expiresAt: string;
      } | null = null;

      if (isS3BlobStorageConfigured()) {
        storedImage = await getStoredImageS3(key);
      }

      if (!storedImage) {
        // Fallback to memory storage
        cleanupExpiredImages();
        storedImage = getStoredImage(key);
      }

      if (!storedImage) {
        throw new Error(`Image not found or expired: ${key}`);
      }

      // Get the presigned PUT URL for the output image
      const outputUrl = context?.blobs.output.image;
      if (outputUrl) {
        try {
          // Extract the output blob ID from the presigned URL
          // URL format: https://bucket.s3.region.amazonaws.com/output/{id}?...
          const urlObj = new URL(outputUrl);
          const pathParts = urlObj.pathname.split("/");
          const outputIndex = pathParts.indexOf("output");
          const outputId = outputIndex !== -1 ? pathParts[outputIndex + 1] : undefined;

          if (outputId) {
            // Use direct S3 write (more reliable than fetch in Lambda)
            await writeOutputBlobS3(outputId, storedImage.data, storedImage.contentType);
          } else {
            // Fallback to presigned URL if we can't extract the ID
            const putResponse = await fetch(outputUrl, {
              method: "PUT",
              headers: {
                "Content-Type": storedImage.contentType,
              },
              body: new Uint8Array(storedImage.data),
            });

            if (!putResponse.ok) {
              const errorText = await putResponse.text().catch(() => "");
              throw new Error(
                `Failed to write image: ${putResponse.status} ${putResponse.statusText} - ${errorText}`
              );
            }
          }
        } catch (fetchError) {
          const errorMessage =
            fetchError instanceof Error ? fetchError.message : String(fetchError);
          console.error(
            "[get_image] fetch error:",
            errorMessage,
            "URL:",
            outputUrl.substring(0, 100)
          );
          throw new Error(`Failed to upload output image: ${errorMessage}`);
        }
      }

      return {
        // Return the key as the image identifier
        image: key,
        contentType: storedImage.contentType,
        uploadedAt: storedImage.uploadedAt,
        expiresAt: storedImage.expiresAt,
      };
    },
  })
  .registerTool("list_images", {
    inputSchema: z.object({}),
    outputSchema: z.object({
      images: z.array(ImageInfoSchema).describe("List of stored images"),
      count: z.number().describe("Total number of images"),
    }),
    description: "List all stored images (not expired)",
    handler: async () => {
      // List images from S3 if configured
      if (isS3BlobStorageConfigured()) {
        const images = await listStoredImagesS3();
        return {
          images,
          count: images.length,
        };
      }

      // Fallback to memory storage
      cleanupExpiredImages();
      const images = listStoredImages();

      return {
        images,
        count: images.length,
      };
    },
  })
  .build();
