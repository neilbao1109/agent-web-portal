/**
 * Storage Provider Types
 *
 * Defines the interface for storage backends that handle blob presigned URL generation.
 */

/**
 * Presigned URL pair for output blobs
 */
export interface PresignedUrlPair {
  /** The permanent URI for the blob (e.g., s3://bucket/key) */
  uri: string;
  /** The presigned URL for uploading (PUT) */
  presignedUrl: string;
}

/**
 * Options for generating presigned URLs
 */
export interface PresignedUrlOptions {
  /** Expiration time in seconds (default: 3600) */
  expiresIn?: number;
  /** Content type hint for the blob */
  contentType?: string;
}

/**
 * Storage provider interface
 *
 * Implementations of this interface handle the generation of presigned URLs
 * for reading and writing blobs in a specific storage backend.
 */
export interface StorageProvider {
  /**
   * Generate a presigned GET URL for reading a blob
   *
   * @param uri - The permanent URI of the blob (e.g., s3://bucket/key)
   * @param options - Optional configuration
   * @returns The presigned URL for reading
   */
  generatePresignedGetUrl(uri: string, options?: PresignedUrlOptions): Promise<string>;

  /**
   * Generate a presigned PUT URL for writing a blob
   *
   * @param prefix - The prefix/folder for the new blob
   * @param options - Optional configuration
   * @returns Object containing the permanent URI and presigned URL
   */
  generatePresignedPutUrl(prefix: string, options?: PresignedUrlOptions): Promise<PresignedUrlPair>;

  /**
   * Parse a URI to check if it's managed by this provider
   *
   * @param uri - The URI to check
   * @returns True if this provider can handle the URI
   */
  canHandle(uri: string): boolean;
}
