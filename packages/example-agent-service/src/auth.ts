/**
 * Cognito Authentication Module
 *
 * Provides user authentication using AWS Cognito User Pools.
 * Supports signup, email confirmation, login, token refresh, and JWT verification.
 */

import {
  type AuthFlowType,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import * as jose from "jose";

// ============================================================================
// Types
// ============================================================================

export interface AuthConfig {
  userPoolId: string;
  clientId: string;
  region: string;
}

export interface SignUpRequest {
  email: string;
  password: string;
  name?: string;
}

export interface SignUpResponse {
  userId: string;
  userConfirmed: boolean;
  codeDeliveryDestination?: string;
}

export interface ConfirmSignUpRequest {
  email: string;
  code: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface UserInfo {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

// ============================================================================
// Auth Service
// ============================================================================

export class AuthService {
  private client: CognitoIdentityProviderClient;
  private config: AuthConfig;
  private jwks: jose.JWTVerifyGetKey | null = null;

  constructor(config: AuthConfig) {
    this.config = config;
    this.client = new CognitoIdentityProviderClient({
      region: config.region,
    });
  }

  /**
   * Register a new user with email and password
   */
  async signUp(request: SignUpRequest): Promise<SignUpResponse> {
    const userAttributes = [{ Name: "email", Value: request.email }];

    if (request.name) {
      userAttributes.push({ Name: "name", Value: request.name });
    }

    const command = new SignUpCommand({
      ClientId: this.config.clientId,
      Username: request.email,
      Password: request.password,
      UserAttributes: userAttributes,
    });

    const response = await this.client.send(command);

    return {
      userId: response.UserSub ?? "",
      userConfirmed: response.UserConfirmed ?? false,
      codeDeliveryDestination: response.CodeDeliveryDetails?.Destination,
    };
  }

  /**
   * Confirm user registration with verification code
   */
  async confirmSignUp(request: ConfirmSignUpRequest): Promise<void> {
    const command = new ConfirmSignUpCommand({
      ClientId: this.config.clientId,
      Username: request.email,
      ConfirmationCode: request.code,
    });

    await this.client.send(command);
  }

  /**
   * Resend confirmation code
   */
  async resendConfirmationCode(email: string): Promise<string | undefined> {
    const command = new ResendConfirmationCodeCommand({
      ClientId: this.config.clientId,
      Username: email,
    });

    const response = await this.client.send(command);
    return response.CodeDeliveryDetails?.Destination;
  }

  /**
   * Login with email and password
   */
  async login(request: LoginRequest): Promise<AuthTokens> {
    const command = new InitiateAuthCommand({
      ClientId: this.config.clientId,
      AuthFlow: "USER_PASSWORD_AUTH" as AuthFlowType,
      AuthParameters: {
        USERNAME: request.email,
        PASSWORD: request.password,
      },
    });

    const response = await this.client.send(command);
    const result = response.AuthenticationResult;

    if (!result?.AccessToken || !result?.RefreshToken || !result?.IdToken) {
      throw new Error("Authentication failed: incomplete token response");
    }

    return {
      accessToken: result.AccessToken,
      refreshToken: result.RefreshToken,
      idToken: result.IdToken,
      expiresIn: result.ExpiresIn ?? 3600,
    };
  }

  /**
   * Refresh tokens using refresh token
   */
  async refresh(request: RefreshRequest): Promise<Omit<AuthTokens, "refreshToken">> {
    const command = new InitiateAuthCommand({
      ClientId: this.config.clientId,
      AuthFlow: "REFRESH_TOKEN_AUTH" as AuthFlowType,
      AuthParameters: {
        REFRESH_TOKEN: request.refreshToken,
      },
    });

    const response = await this.client.send(command);
    const result = response.AuthenticationResult;

    if (!result?.AccessToken || !result?.IdToken) {
      throw new Error("Token refresh failed: incomplete token response");
    }

    return {
      accessToken: result.AccessToken,
      idToken: result.IdToken,
      expiresIn: result.ExpiresIn ?? 3600,
    };
  }

  /**
   * Get user info from access token (calls Cognito API)
   */
  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const command = new GetUserCommand({
      AccessToken: accessToken,
    });

    const response = await this.client.send(command);
    const attributes = response.UserAttributes ?? [];

    const getAttr = (name: string): string | undefined =>
      attributes.find((a) => a.Name === name)?.Value;

    return {
      sub: getAttr("sub") ?? "",
      email: getAttr("email") ?? "",
      emailVerified: getAttr("email_verified") === "true",
      name: getAttr("name"),
    };
  }

  /**
   * Sign out user globally (invalidate all tokens)
   */
  async signOut(accessToken: string): Promise<void> {
    const command = new GlobalSignOutCommand({
      AccessToken: accessToken,
    });

    await this.client.send(command);
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(request: ForgotPasswordRequest): Promise<string | undefined> {
    const command = new ForgotPasswordCommand({
      ClientId: this.config.clientId,
      Username: request.email,
    });

    const response = await this.client.send(command);
    return response.CodeDeliveryDetails?.Destination;
  }

  /**
   * Reset password with confirmation code
   */
  async resetPassword(request: ResetPasswordRequest): Promise<void> {
    const command = new ConfirmForgotPasswordCommand({
      ClientId: this.config.clientId,
      Username: request.email,
      ConfirmationCode: request.code,
      Password: request.newPassword,
    });

    await this.client.send(command);
  }

  /**
   * Verify JWT access token and extract claims
   */
  async verifyToken(accessToken: string): Promise<UserInfo> {
    // Initialize JWKS if not already done
    if (!this.jwks) {
      const jwksUrl = `https://cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}/.well-known/jwks.json`;
      this.jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
    }

    try {
      const { payload } = await jose.jwtVerify(accessToken, this.jwks, {
        issuer: `https://cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}`,
      });

      return {
        sub: payload.sub ?? "",
        email: (payload.email as string) ?? (payload.username as string) ?? "",
        emailVerified: payload.email_verified === true,
        name: payload.name as string | undefined,
      };
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        throw new AuthError("Token expired", "TOKEN_EXPIRED");
      }
      if (error instanceof jose.errors.JWTInvalid) {
        throw new AuthError("Invalid token", "INVALID_TOKEN");
      }
      throw new AuthError("Token verification failed", "VERIFICATION_FAILED");
    }
  }
}

// ============================================================================
// Auth Error
// ============================================================================

export type AuthErrorCode =
  | "TOKEN_EXPIRED"
  | "INVALID_TOKEN"
  | "VERIFICATION_FAILED"
  | "USER_NOT_FOUND"
  | "USER_NOT_CONFIRMED"
  | "INVALID_PASSWORD"
  | "USER_EXISTS"
  | "CODE_MISMATCH"
  | "EXPIRED_CODE"
  | "LIMIT_EXCEEDED"
  | "UNKNOWN";

export class AuthError extends Error {
  code: AuthErrorCode;

  constructor(message: string, code: AuthErrorCode) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }

  static fromCognitoError(error: unknown): AuthError {
    if (error instanceof Error) {
      const name = error.name;
      const message = error.message;

      switch (name) {
        case "UserNotFoundException":
          return new AuthError("User not found", "USER_NOT_FOUND");
        case "UserNotConfirmedException":
          return new AuthError("User email not confirmed", "USER_NOT_CONFIRMED");
        case "NotAuthorizedException":
          return new AuthError("Invalid credentials", "INVALID_PASSWORD");
        case "UsernameExistsException":
          return new AuthError("User already exists", "USER_EXISTS");
        case "CodeMismatchException":
          return new AuthError("Invalid verification code", "CODE_MISMATCH");
        case "ExpiredCodeException":
          return new AuthError("Verification code expired", "EXPIRED_CODE");
        case "LimitExceededException":
          return new AuthError("Too many attempts, please try later", "LIMIT_EXCEEDED");
        default:
          return new AuthError(message, "UNKNOWN");
      }
    }
    return new AuthError("Unknown error", "UNKNOWN");
  }
}

// ============================================================================
// Factory
// ============================================================================

let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    const userPoolId = process.env.USER_POOL_ID;
    const clientId = process.env.USER_POOL_CLIENT_ID;
    const region = process.env.AWS_REGION_NAME ?? process.env.AWS_REGION ?? "us-east-1";

    if (!userPoolId || !clientId) {
      throw new Error("Missing Cognito configuration: USER_POOL_ID or USER_POOL_CLIENT_ID");
    }

    authServiceInstance = new AuthService({
      userPoolId,
      clientId,
      region,
    });
  }

  return authServiceInstance;
}
