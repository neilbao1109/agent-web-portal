/**
 * CAS Stack - S3 CAS Storage Operations
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import type { CasConfig } from "../types.ts";

export class CasStorage {
  private client: S3Client;
  private bucket: string;

  constructor(config: CasConfig, client?: S3Client) {
    this.bucket = config.casBucket;
    this.client = client ?? new S3Client({});
  }

  /**
   * Convert CAS key to S3 key
   * sha256:abcdef... -> cas/sha256/ab/abcdef...
   */
  private toS3Key(casKey: string): string {
    // Remove "sha256:" prefix if present
    const hash = casKey.startsWith("sha256:") ? casKey.slice(7) : casKey;
    const prefix = hash.slice(0, 2);
    return `cas/sha256/${prefix}/${hash}`;
  }

  /**
   * Compute SHA-256 hash of content
   */
  static computeHash(content: Buffer): string {
    const hash = createHash("sha256").update(content).digest("hex");
    return `sha256:${hash}`;
  }

  /**
   * Check if a blob exists in S3
   */
  async exists(casKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.toS3Key(casKey),
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get blob content from S3
   */
  async get(casKey: string): Promise<{ content: Buffer; contentType: string } | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.toS3Key(casKey),
        })
      );

      const content = Buffer.from(await result.Body!.transformToByteArray());
      const contentType = result.ContentType ?? "application/octet-stream";

      return { content, contentType };
    } catch (error: any) {
      if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Put blob content to S3
   * Returns the CAS key (sha256 hash)
   */
  async put(
    content: Buffer,
    contentType: string = "application/octet-stream"
  ): Promise<{ key: string; size: number; isNew: boolean }> {
    const key = CasStorage.computeHash(content);
    const s3Key = this.toS3Key(key);

    // Check if already exists (global dedup)
    const alreadyExists = await this.exists(key);

    if (!alreadyExists) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: content,
          ContentType: contentType,
        })
      );
    }

    return {
      key,
      size: content.length,
      isNew: !alreadyExists,
    };
  }

  /**
   * Put blob with expected key (validates hash)
   * Returns error if hash doesn't match
   */
  async putWithKey(
    expectedKey: string,
    content: Buffer,
    contentType: string = "application/octet-stream"
  ): Promise<{ key: string; size: number; isNew: boolean } | { error: "hash_mismatch"; expected: string; actual: string }> {
    const actualKey = CasStorage.computeHash(content);

    if (actualKey !== expectedKey) {
      return {
        error: "hash_mismatch",
        expected: expectedKey,
        actual: actualKey,
      };
    }

    return this.put(content, contentType);
  }

  /**
   * Check which keys exist in S3 (for resolve)
   */
  async checkExists(keys: string[]): Promise<{ found: string[]; missing: string[] }> {
    const found: string[] = [];
    const missing: string[] = [];

    // Check in parallel with concurrency limit
    const concurrency = 10;
    for (let i = 0; i < keys.length; i += concurrency) {
      const batch = keys.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (key) => {
          const exists = await this.exists(key);
          return { key, exists };
        })
      );

      for (const { key, exists } of results) {
        if (exists) {
          found.push(key);
        } else {
          missing.push(key);
        }
      }
    }

    return { found, missing };
  }

  /**
   * Get metadata for a blob
   */
  async getMetadata(casKey: string): Promise<{ contentType: string; size: number } | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.toS3Key(casKey),
        })
      );

      return {
        contentType: result.ContentType ?? "application/octet-stream",
        size: result.ContentLength ?? 0,
      };
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}
