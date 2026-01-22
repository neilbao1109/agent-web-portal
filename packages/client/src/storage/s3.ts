/**
 * S3 Storage Provider
 *
 * Implements the StorageProvider interface for AWS S3 and S3-compatible storage.
 */

import type { PresignedUrlOptions, PresignedUrlPair, StorageProvider } from "./types.ts";

/**
 * Options for S3 storage provider
 */
export interface S3StorageProviderOptions {
  /** AWS region */
  region: string;
  /** S3 bucket name */
  bucket: string;
  /** Optional endpoint for S3-compatible services (e.g., MinIO) */
  endpoint?: string;
  /** AWS credentials (optional, uses default credential chain if not provided) */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  /** Default expiration time in seconds (default: 3600) */
  defaultExpiresIn?: number;
  /** Optional prefix for all generated keys */
  keyPrefix?: string;
}

/**
 * Parse an S3 URI into bucket and key
 */
function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return { bucket: match[1], key: match[2] };
}

/**
 * Generate a unique key for a new blob
 */
function generateUniqueKey(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  return cleanPrefix ? `${cleanPrefix}/${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * S3 Storage Provider
 *
 * Provides presigned URL generation for AWS S3 buckets.
 *
 * Note: This implementation uses the AWS SDK v3 for generating presigned URLs.
 * The SDK must be installed separately as a peer dependency.
 *
 * @example
 * ```typescript
 * const provider = new S3StorageProvider({
 *   region: "us-east-1",
 *   bucket: "my-bucket",
 *   credentials: {
 *     accessKeyId: "...",
 *     secretAccessKey: "...",
 *   },
 * });
 *
 * const getUrl = await provider.generatePresignedGetUrl("s3://my-bucket/file.pdf");
 * const { uri, presignedUrl } = await provider.generatePresignedPutUrl("uploads/");
 * ```
 */
export class S3StorageProvider implements StorageProvider {
  private options: S3StorageProviderOptions;
  private s3Client: any; // Lazy loaded AWS S3 client

  constructor(options: S3StorageProviderOptions) {
    this.options = {
      defaultExpiresIn: 3600,
      ...options,
    };
  }

  /**
   * Lazy load the AWS SDK and create the S3 client
   */
  private async getS3Client(): Promise<any> {
    if (this.s3Client) {
      return this.s3Client;
    }

    // Dynamic import to avoid requiring AWS SDK if not using S3
    const { S3Client } = await import("@aws-sdk/client-s3");

    const clientConfig: any = {
      region: this.options.region,
    };

    if (this.options.endpoint) {
      clientConfig.endpoint = this.options.endpoint;
      clientConfig.forcePathStyle = true; // Required for S3-compatible services
    }

    if (this.options.credentials) {
      clientConfig.credentials = this.options.credentials;
    }

    this.s3Client = new S3Client(clientConfig);
    return this.s3Client;
  }

  /**
   * Generate a presigned GET URL for reading a blob
   */
  async generatePresignedGetUrl(uri: string, options?: PresignedUrlOptions): Promise<string> {
    const parsed = parseS3Uri(uri);
    if (!parsed) {
      throw new Error(`Invalid S3 URI: ${uri}`);
    }

    if (parsed.bucket !== this.options.bucket) {
      throw new Error(
        `URI bucket "${parsed.bucket}" does not match configured bucket "${this.options.bucket}"`
      );
    }

    const client = await this.getS3Client();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

    const command = new GetObjectCommand({
      Bucket: this.options.bucket,
      Key: parsed.key,
    });

    const expiresIn = options?.expiresIn ?? this.options.defaultExpiresIn;
    return getSignedUrl(client, command, { expiresIn });
  }

  /**
   * Generate a presigned PUT URL for writing a blob
   */
  async generatePresignedPutUrl(
    prefix: string,
    options?: PresignedUrlOptions
  ): Promise<PresignedUrlPair> {
    const fullPrefix = this.options.keyPrefix
      ? `${this.options.keyPrefix}/${prefix}`.replace(/\/+/g, "/")
      : prefix;

    const key = generateUniqueKey(fullPrefix);
    const uri = `s3://${this.options.bucket}/${key}`;

    const client = await this.getS3Client();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

    const commandInput: any = {
      Bucket: this.options.bucket,
      Key: key,
    };

    if (options?.contentType) {
      commandInput.ContentType = options.contentType;
    }

    const command = new PutObjectCommand(commandInput);

    const expiresIn = options?.expiresIn ?? this.options.defaultExpiresIn;
    const presignedUrl = await getSignedUrl(client, command, { expiresIn });

    return { uri, presignedUrl };
  }

  /**
   * Check if this provider can handle the given URI
   */
  canHandle(uri: string): boolean {
    const parsed = parseS3Uri(uri);
    return parsed !== null && parsed.bucket === this.options.bucket;
  }
}
