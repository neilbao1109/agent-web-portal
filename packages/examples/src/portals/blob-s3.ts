/**
 * S3-based Blob Storage for Lambda deployment
 *
 * Provides presigned URLs for blob upload/download operations.
 * - Temporary uploads: temp/{id} - 5 minute presigned GET URL
 * - Output blobs: output/{id} - 5 minute presigned PUT/GET URL
 * - Permanent storage: images/{date}/{id} - 1 day TTL
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// =============================================================================
// Configuration
// =============================================================================

const BLOB_BUCKET = process.env.BLOB_BUCKET ?? "";
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";

// TTL settings (in seconds for presigned URLs)
const TEMP_TTL_SECONDS = 5 * 60; // 5 minutes
const OUTPUT_TTL_SECONDS = 5 * 60; // 5 minutes

// S3 Client (lazy initialization)
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: AWS_REGION });
  }
  return s3Client;
}

// =============================================================================
// Temporary Upload Store (presigned GET URLs)
// =============================================================================

/**
 * Store a temporary upload and return presigned GET URL
 */
export async function storeTempUploadS3(
  data: ArrayBuffer,
  contentType: string
): Promise<{ id: string; readUrl: string; expiresAt: string }> {
  const now = Date.now();
  const id = `temp-${now}-${Math.random().toString(36).substring(2, 10)}`;
  const key = `temp/${id}`;
  const expiresAt = new Date(now + TEMP_TTL_SECONDS * 1000);

  const client = getS3Client();

  // Upload the file to S3
  await client.send(
    new PutObjectCommand({
      Bucket: BLOB_BUCKET,
      Key: key,
      Body: new Uint8Array(data),
      ContentType: contentType,
      Metadata: {
        "expires-at": expiresAt.toISOString(),
      },
    })
  );

  // Generate presigned GET URL
  const readUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: BLOB_BUCKET,
      Key: key,
    }),
    { expiresIn: TEMP_TTL_SECONDS }
  );

  return {
    id,
    readUrl,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Get a temporary upload from S3
 */
export async function getTempUploadS3(
  id: string
): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const key = `temp/${id}`;
  const client = getS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: BLOB_BUCKET,
        Key: key,
      })
    );

    if (!response.Body) {
      return null;
    }

    const data = await response.Body.transformToByteArray();
    return {
      data: data.buffer as ArrayBuffer,
      contentType: response.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

// =============================================================================
// Output Blob Store (presigned PUT/GET URLs)
// =============================================================================

/**
 * Create an output blob slot and return presigned URLs
 */
export async function createOutputBlobSlotS3(): Promise<{
  id: string;
  writeUrl: string;
  readUrl: string;
  expiresAt: string;
}> {
  const now = Date.now();
  const id = `output-${now}-${Math.random().toString(36).substring(2, 10)}`;
  const key = `output/${id}`;
  const expiresAt = new Date(now + OUTPUT_TTL_SECONDS * 1000);

  const client = getS3Client();

  // Generate presigned PUT URL
  const writeUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: BLOB_BUCKET,
      Key: key,
    }),
    { expiresIn: OUTPUT_TTL_SECONDS }
  );

  // Generate presigned GET URL
  const readUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: BLOB_BUCKET,
      Key: key,
    }),
    { expiresIn: OUTPUT_TTL_SECONDS }
  );

  return {
    id,
    writeUrl,
    readUrl,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Read data from output blob
 */
export async function readOutputBlobS3(
  id: string
): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const key = `output/${id}`;
  const client = getS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: BLOB_BUCKET,
        Key: key,
      })
    );

    if (!response.Body) {
      return null;
    }

    const data = await response.Body.transformToByteArray();
    return {
      data: data.buffer as ArrayBuffer,
      contentType: response.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

// =============================================================================
// Permanent Image Store
// =============================================================================

/**
 * Store an image permanently in S3
 */
export async function storeImageS3(
  data: ArrayBuffer,
  contentType: string,
  customKey?: string
): Promise<{ key: string; uploadedAt: string; expiresAt: string }> {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const timestamp = now.getTime();
  const random = Math.random().toString(36).substring(2, 10);
  const key = customKey ?? `images/${dateStr}/${timestamp}-${random}`;

  // 1 day expiration
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: BLOB_BUCKET,
      Key: key,
      Body: new Uint8Array(data),
      ContentType: contentType,
      Metadata: {
        "uploaded-at": now.toISOString(),
        "expires-at": expiresAt.toISOString(),
      },
    })
  );

  return {
    key,
    uploadedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Get an image from S3
 */
export async function getStoredImageS3(key: string): Promise<{
  data: ArrayBuffer;
  contentType: string;
  uploadedAt: string;
  expiresAt: string;
} | null> {
  const client = getS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: BLOB_BUCKET,
        Key: key,
      })
    );

    if (!response.Body) {
      return null;
    }

    const data = await response.Body.transformToByteArray();
    const metadata = response.Metadata ?? {};

    return {
      data: data.buffer as ArrayBuffer,
      contentType: response.ContentType ?? "application/octet-stream",
      uploadedAt: metadata["uploaded-at"] ?? new Date().toISOString(),
      expiresAt: metadata["expires-at"] ?? new Date().toISOString(),
    };
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

/**
 * List all stored images
 */
export async function listStoredImagesS3(): Promise<
  Array<{
    key: string;
    contentType: string;
    uploadedAt: string;
    size: number;
  }>
> {
  const client = getS3Client();
  const images: Array<{
    key: string;
    contentType: string;
    uploadedAt: string;
    size: number;
  }> = [];

  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: BLOB_BUCKET,
        Prefix: "images/",
        ContinuationToken: continuationToken,
      })
    );

    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key) {
          images.push({
            key: object.Key,
            contentType: "image/*", // Would need HeadObject for actual content type
            uploadedAt: object.LastModified?.toISOString() ?? new Date().toISOString(),
            size: object.Size ?? 0,
          });
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return images;
}

/**
 * Generate a presigned URL for direct download
 */
export async function getImagePresignedUrlS3(key: string, expiresIn = 300): Promise<string | null> {
  const client = getS3Client();

  try {
    // Check if the object exists
    await client.send(
      new HeadObjectCommand({
        Bucket: BLOB_BUCKET,
        Key: key,
      })
    );

    // Generate presigned URL
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: BLOB_BUCKET,
        Key: key,
      }),
      { expiresIn }
    );
  } catch (error) {
    if ((error as { name?: string }).name === "NotFound") {
      return null;
    }
    throw error;
  }
}

/**
 * Check if S3 blob storage is configured
 */
export function isS3BlobStorageConfigured(): boolean {
  return BLOB_BUCKET !== "";
}

/**
 * Get the configured bucket name
 */
export function getBlobBucketName(): string {
  return BLOB_BUCKET;
}
