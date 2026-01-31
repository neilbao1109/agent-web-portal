/**
 * Image Workshop Stack - Type Definitions
 */

// ============================================================================
// Configuration
// ============================================================================

export interface Config {
  /** DynamoDB tokens table name */
  tokensTable: string;
  /** Cognito User Pool ID */
  cognitoUserPoolId?: string;
  /** Cognito Client ID */
  cognitoClientId?: string;
  /** Cognito Hosted UI URL */
  cognitoHostedUiUrl?: string;
  /** Cognito region */
  cognitoRegion?: string;
  /** CAS endpoint */
  casEndpoint?: string;
  /** Callback base URL (for skill URLs) */
  callbackBaseUrl?: string;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  return {
    tokensTable: process.env.TOKENS_TABLE ?? "image-workshop-tokens",
    cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
    cognitoClientId: process.env.COGNITO_CLIENT_ID,
    cognitoHostedUiUrl: process.env.COGNITO_HOSTED_UI_URL,
    cognitoRegion: process.env.COGNITO_REGION ?? process.env.AWS_REGION ?? "us-east-1",
    casEndpoint: process.env.CAS_ENDPOINT,
    callbackBaseUrl: process.env.CALLBACK_BASE_URL,
  };
}

// ============================================================================
// HTTP Types
// ============================================================================

export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body?: string | Buffer;
}

export interface HttpResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface AuthContext {
  userId: string;
  realm: string;
}
