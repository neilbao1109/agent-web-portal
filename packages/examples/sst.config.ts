/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST Ion (v3) Configuration for AWP Examples
 *
 * Deploys:
 * - Lambda API for MCP portals
 * - Static site for React UI (S3 + CloudFront)
 * - DynamoDB table for auth
 * - S3 bucket for blob storage
 */

export default $config({
  app(input) {
    return {
      name: "awp-examples",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    // DynamoDB table for auth
    const authTable = new sst.aws.Dynamo("AuthTable", {
      fields: {
        pk: "string",
      },
      primaryIndex: { hashKey: "pk" },
      ttl: "ttl",
    });

    // S3 bucket for blob storage
    const blobBucket = new sst.aws.Bucket("BlobBucket", {
      cors: {
        allowHeaders: ["*"],
        allowMethods: ["GET", "PUT", "HEAD"],
        allowOrigins: ["*"],
        maxAge: "1 hour",
      },
    });

    // S3 bucket for skills (optional)
    const skillsBucket = new sst.aws.Bucket("SkillsBucket");

    // Lambda function for API
    const api = new sst.aws.ApiGatewayV2("Api", {
      cors: {
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "Mcp-Session-Id",
          "X-AWP-Signature",
          "X-AWP-Pubkey",
          "X-AWP-Timestamp",
        ],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowOrigins: ["*"],
      },
    });

    // API routes - all handled by a single Lambda
    api.route("$default", {
      handler: "src/handler.handler",
      link: [authTable, blobBucket, skillsBucket],
      environment: {
        AUTH_TABLE: authTable.name,
        BLOB_BUCKET: blobBucket.name,
        SKILLS_BUCKET: skillsBucket.name,
      },
      timeout: "30 seconds",
      memory: "512 MB",
    });

    // Static site for React UI (S3 + CloudFront)
    const site = new sst.aws.StaticSite("UI", {
      path: "ui",
      build: {
        command: "npm run build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: api.url,
      },
    });

    return {
      api: api.url,
      ui: site.url,
      authTable: authTable.name,
      blobBucket: blobBucket.name,
      skillsBucket: skillsBucket.name,
    };
  },
});
