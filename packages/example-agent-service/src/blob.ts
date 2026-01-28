/**
 * Blob Storage Module
 *
 * Provides temporary blob storage using S3 with presigned URLs.
 * Uses ULID for globally unique, time-sortable blob IDs.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ulid } from "ulid";

// ============================================================================
// Types
// ============================================================================

export interface BlobConfig {
  bucketName: string;
  region: string;
}

export interface PrepareOutputRequest {
  /** User ID for namespacing blobs */
  userId: string;
  /** Optional content type hint */
  contentType?: string;
  /** Optional prefix for organizing blobs */
  prefix?: string;
}

export interface PrepareOutputResponse {
  /** Permanent blob URI: blob://{id} */
  uri: string;
  /** Blob ID (ULID-based) */
  blobId: string;
  /** Presigned URL for PUT upload */
  presignedUrl: string;
  /** When the presigned URL expires */
  expiresAt: string;
}

export interface PrepareDownloadRequest {
  /** Blob URI: blob://{id} or just the ID */
  uri: string;
}

export interface PrepareDownloadResponse {
  /** Presigned URL for GET download */
  presignedUrl: string;
  /** Content type if known */
  contentType?: string;
  /** When the presigned URL expires */
  expiresAt: string;
}

export interface BlobMetadata {
  contentType?: string;
  contentLength?: number;
  lastModified?: Date;
  exists: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Presigned URL expiration for uploads (5 minutes) */
const UPLOAD_EXPIRES_IN = 5 * 60;

/** Presigned URL expiration for downloads (1 hour) */
const DOWNLOAD_EXPIRES_IN = 60 * 60;

/** Blob URI prefix */
const BLOB_URI_PREFIX = "blob://";

// ============================================================================
// Blob Storage Service
// ============================================================================

export class BlobStorageService {
  private client: S3Client;
  private config: BlobConfig;

  constructor(config: BlobConfig) {
    this.config = config;
    this.client = new S3Client({
      region: config.region,
    });
  }

  /**
   * Generate a unique blob ID using ULID
   */
  private generateBlobId(prefix?: string): string {
    const id = ulid();
    return prefix ? `${prefix}-${id}` : id;
  }

  /**
   * Convert blob URI to S3 key
   * blob://ABC123 -> output/{userId}/ABC123
   */
  private uriToKey(uri: string, userId?: string): string {
    const blobId = this.extractBlobId(uri);
    // If userId is provided, use it for namespacing
    // Otherwise, assume the ID already contains the path
    if (userId) {
      return `output/${userId}/${blobId}`;
    }
    return `output/${blobId}`;
  }

  /**
   * Extract blob ID from URI
   */
  private extractBlobId(uri: string): string {
    if (uri.startsWith(BLOB_URI_PREFIX)) {
      return uri.slice(BLOB_URI_PREFIX.length);
    }
    if (uri.startsWith("awp://")) {
      // awp://portal/blobs/ID -> ID
      const parts = uri.split("/");
      return parts[parts.length - 1] ?? uri;
    }
    return uri;
  }

  /**
   * Create an output blob slot with presigned upload URL
   */
  async prepareOutput(request: PrepareOutputRequest): Promise<PrepareOutputResponse> {
    const blobId = this.generateBlobId(request.prefix);
    const key = `output/${request.userId}/${blobId}`;
    const uri = `${BLOB_URI_PREFIX}${blobId}`;

    const expiresAt = new Date(Date.now() + UPLOAD_EXPIRES_IN * 1000);

    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      ContentType: request.contentType ?? "application/octet-stream",
      // Store userId as metadata for future reference
      Metadata: {
        "user-id": request.userId,
        "created-at": new Date().toISOString(),
      },
    });

    const presignedUrl = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_EXPIRES_IN,
    });

    return {
      uri,
      blobId,
      presignedUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Get presigned download URL for a blob
   */
  async prepareDownload(
    request: PrepareDownloadRequest,
    userId?: string
  ): Promise<PrepareDownloadResponse> {
    const blobId = this.extractBlobId(request.uri);

    // Try to find the blob - it could be in user's folder or directly in output/
    let key = userId ? `output/${userId}/${blobId}` : `output/${blobId}`;

    // Check if blob exists and get metadata
    let metadata: BlobMetadata;
    try {
      metadata = await this.getMetadata(key);
    } catch {
      // Try without userId prefix
      if (userId) {
        key = `output/${blobId}`;
        metadata = await this.getMetadata(key);
      } else {
        throw new BlobError("Blob not found", "NOT_FOUND");
      }
    }

    if (!metadata.exists) {
      throw new BlobError("Blob not found", "NOT_FOUND");
    }

    const expiresAt = new Date(Date.now() + DOWNLOAD_EXPIRES_IN * 1000);

    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(this.client, command, {
      expiresIn: DOWNLOAD_EXPIRES_IN,
    });

    return {
      presignedUrl,
      contentType: metadata.contentType,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Get blob metadata
   */
  async getMetadata(keyOrUri: string): Promise<BlobMetadata> {
    const key = keyOrUri.startsWith(BLOB_URI_PREFIX) ? this.uriToKey(keyOrUri) : keyOrUri;

    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        exists: true,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "NotFound") {
        return { exists: false };
      }
      // For HeadObject, 404 comes as a different error
      if (
        error instanceof Error &&
        "statusCode" in error &&
        (error as { statusCode: number }).statusCode === 404
      ) {
        return { exists: false };
      }
      throw error;
    }
  }

  /**
   * Read blob data directly (for Service Worker fallback)
   */
  async readBlob(
    blobId: string,
    userId?: string
  ): Promise<{ data: Uint8Array; contentType: string }> {
    // Try user-scoped path first
    let key = userId ? `output/${userId}/${blobId}` : `output/${blobId}`;

    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new BlobError("Empty blob response", "NOT_FOUND");
      }

      const data = await response.Body.transformToByteArray();

      return {
        data,
        contentType: response.ContentType ?? "application/octet-stream",
      };
    } catch {
      // Try without userId prefix
      if (userId && key.includes(userId)) {
        key = `output/${blobId}`;
        try {
          const command = new GetObjectCommand({
            Bucket: this.config.bucketName,
            Key: key,
          });
          const response = await this.client.send(command);
          if (!response.Body) {
            throw new BlobError("Empty blob response", "NOT_FOUND");
          }
          const data = await response.Body.transformToByteArray();
          return {
            data,
            contentType: response.ContentType ?? "application/octet-stream",
          };
        } catch {
          throw new BlobError("Blob not found", "NOT_FOUND");
        }
      }
      throw new BlobError("Blob not found", "NOT_FOUND");
    }
  }

  /**
   * Write blob data directly (for simple uploads)
   */
  async writeBlob(
    blobId: string,
    data: Uint8Array,
    contentType: string,
    userId: string
  ): Promise<void> {
    const key = `output/${userId}/${blobId}`;

    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
      Metadata: {
        "user-id": userId,
        "created-at": new Date().toISOString(),
      },
    });

    await this.client.send(command);
  }

  /**
   * Delete a blob
   */
  async deleteBlob(blobId: string, userId?: string): Promise<void> {
    const key = userId ? `output/${userId}/${blobId}` : `output/${blobId}`;

    const command = new DeleteObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    });

    await this.client.send(command);
  }
}

// ============================================================================
// Blob Error
// ============================================================================

export type BlobErrorCode =
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "INVALID_URI"
  | "UPLOAD_FAILED"
  | "UNKNOWN";

export class BlobError extends Error {
  code: BlobErrorCode;

  constructor(message: string, code: BlobErrorCode) {
    super(message);
    this.name = "BlobError";
    this.code = code;
  }
}

// ============================================================================
// Factory
// ============================================================================

let blobServiceInstance: BlobStorageService | null = null;

export function getBlobStorageService(): BlobStorageService {
  if (!blobServiceInstance) {
    const bucketName = process.env.BLOB_BUCKET;
    const region = process.env.AWS_REGION_NAME ?? process.env.AWS_REGION ?? "us-east-1";

    if (!bucketName) {
      throw new Error("Missing blob storage configuration: BLOB_BUCKET");
    }

    blobServiceInstance = new BlobStorageService({
      bucketName,
      region,
    });
  }

  return blobServiceInstance;
}
