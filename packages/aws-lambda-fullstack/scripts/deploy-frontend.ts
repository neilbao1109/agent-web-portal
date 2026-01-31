/**
 * AWS Lambda Fullstack Template - Frontend Deploy Script
 *
 * Uploads the built static files to S3 and invalidates CloudFront cache.
 * This script expects the frontend to already be built in frontend/dist/
 */

import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";
import { readdir, readFile, stat } from "fs/promises";
import { join, extname } from "path";

// ============================================================================
// Configuration
// ============================================================================

// Read stack name from samconfig.toml or use environment variable
const STACK_NAME = process.env.STACK_NAME || "my-fullstack-app";
const AWS_PROFILE = process.env.AWS_PROFILE;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const DIST_DIR = join(import.meta.dir, "..", "frontend", "dist");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

// ============================================================================
// AWS Clients
// ============================================================================

function createClients() {
  const credentials = AWS_PROFILE ? fromIni({ profile: AWS_PROFILE }) : undefined;

  return {
    cf: new CloudFormationClient({ region: AWS_REGION, credentials }),
    s3: new S3Client({ region: AWS_REGION, credentials }),
    cloudfront: new CloudFrontClient({ region: AWS_REGION, credentials }),
  };
}

// ============================================================================
// Stack Outputs
// ============================================================================

async function getStackOutputs(
  cf: CloudFormationClient
): Promise<Record<string, string>> {
  const result = await cf.send(
    new DescribeStacksCommand({ StackName: STACK_NAME })
  );
  const stack = result.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${STACK_NAME} not found`);
  }

  const outputs: Record<string, string> = {};
  for (const output of stack.Outputs ?? []) {
    if (output.OutputKey && output.OutputValue) {
      outputs[output.OutputKey] = output.OutputValue;
    }
  }
  return outputs;
}

// ============================================================================
// File Operations
// ============================================================================

async function getAllFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(...(await getAllFiles(fullPath, relativePath)));
    } else {
      files.push(relativePath);
    }
  }

  return files;
}

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ============================================================================
// S3 Operations
// ============================================================================

async function clearBucket(s3: S3Client, bucket: string): Promise<void> {
  console.log(`Clearing existing files from ${bucket}...`);

  let continuationToken: string | undefined;

  do {
    const listResult = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      })
    );

    const objects = listResult.Contents ?? [];
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key })),
          },
        })
      );
      console.log(`  Deleted ${objects.length} objects`);
    }

    continuationToken = listResult.NextContinuationToken;
  } while (continuationToken);
}

async function uploadFiles(s3: S3Client, bucket: string): Promise<number> {
  const files = await getAllFiles(DIST_DIR);
  console.log(`Uploading ${files.length} files to ${bucket}...`);

  for (const file of files) {
    const filePath = join(DIST_DIR, file);
    const content = await readFile(filePath);
    const contentType = getMimeType(file);

    // Set cache headers
    const cacheControl =
      file.startsWith("assets/") || file.endsWith(".js") || file.endsWith(".css")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate";

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: file,
        Body: content,
        ContentType: contentType,
        CacheControl: cacheControl,
      })
    );

    console.log(`  ${file} (${contentType})`);
  }

  return files.length;
}

// ============================================================================
// CloudFront Invalidation
// ============================================================================

async function invalidateCache(
  cloudfront: CloudFrontClient,
  distributionId: string
): Promise<void> {
  console.log(`Invalidating CloudFront cache for ${distributionId}...`);

  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `deploy-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ["/*"],
        },
      },
    })
  );

  console.log("  Invalidation created");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("=".repeat(60));
  console.log("Frontend Deploy");
  console.log("=".repeat(60));
  console.log();

  // Check if dist exists
  try {
    await stat(DIST_DIR);
  } catch {
    console.error(`Error: ${DIST_DIR} does not exist. Run 'bun run build:frontend' first.`);
    process.exit(1);
  }

  const clients = createClients();

  console.log(`Getting outputs from stack: ${STACK_NAME}`);
  const outputs = await getStackOutputs(clients.cf);
  console.log();

  const uiBucket = outputs.UiBucketName;
  const distributionId = outputs.CloudFrontDistributionId;
  const cloudFrontUrl = outputs.CloudFrontUrl;

  if (!uiBucket) {
    throw new Error("UiBucketName not found in stack outputs");
  }
  if (!distributionId) {
    throw new Error("CloudFrontDistributionId not found in stack outputs");
  }

  await clearBucket(clients.s3, uiBucket);
  console.log();

  const fileCount = await uploadFiles(clients.s3, uiBucket);
  console.log();

  await invalidateCache(clients.cloudfront, distributionId);
  console.log();

  console.log("=".repeat(60));
  console.log("Deploy complete!");
  console.log(`  Files uploaded: ${fileCount}`);
  console.log(`  URL: ${cloudFrontUrl}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
