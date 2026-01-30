import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

// Cognito configuration - loaded from environment variables
const COGNITO_USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || "";
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || "";

// Mock auth mode - set VITE_USE_MOCK_AUTH=true in .env
const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH === "true";
const MOCK_USER: User = {
  userId: "mock-user-12345",
  email: "test@example.com",
  name: "Test User",
};
const MOCK_TOKENS: AuthTokens = {
  accessToken: "mock-access-token",
  idToken: "mock-id-token",
  refreshToken: "mock-refresh-token",
};

// Initialize Cognito User Pool (only if not mock mode)
const userPool = !USE_MOCK_AUTH
  ? new CognitoUserPool({
      UserPoolId: COGNITO_USER_POOL_ID,
      ClientId: COGNITO_CLIENT_ID,
    })
  : null;

export interface User {
  userId: string;
  email: string;
  name?: string;
}

interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

interface AuthContextType {
  user: User | null;
  tokens: AuthTokens | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function parseJwt(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return {};
  }
}

function extractUserFromSession(session: CognitoUserSession): User {
  const idToken = session.getIdToken().getJwtToken();
  const payload = parseJwt(idToken);

  return {
    userId: (payload.sub as string) || "",
    email: (payload.email as string) || "",
    name: (payload.name as string) || (payload.email as string) || "",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [loading, setLoading] = useState(true);

  // Refresh session and get new tokens
  const refreshSession = useCallback(async (): Promise<void> => {
    // Mock mode - auto login
    if (USE_MOCK_AUTH) {
      setUser(MOCK_USER);
      setTokens(MOCK_TOKENS);
      return;
    }

    return new Promise((resolve) => {
      const cognitoUser = userPool?.getCurrentUser();
      if (!cognitoUser) {
        setUser(null);
        setTokens(null);
        resolve();
        return;
      }

      cognitoUser.getSession(
        (err: Error | null, session: CognitoUserSession | null) => {
          if (err || !session || !session.isValid()) {
            setUser(null);
            setTokens(null);
            resolve();
            return;
          }

          const newTokens: AuthTokens = {
            accessToken: session.getAccessToken().getJwtToken(),
            idToken: session.getIdToken().getJwtToken(),
            refreshToken: session.getRefreshToken().getToken(),
          };

          setTokens(newTokens);
          setUser(extractUserFromSession(session));
          resolve();
        }
      );
    });
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      await refreshSession();
      setLoading(false);
    };
    checkSession();
  }, [refreshSession]);

  // Login with email and password
  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    // Mock mode - accept any credentials
    if (USE_MOCK_AUTH) {
      setUser(MOCK_USER);
      setTokens(MOCK_TOKENS);
      return { success: true };
    }

    if (!userPool) {
      return { success: false, error: "Auth not configured" };
    }

    return new Promise((resolve) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      const authDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session: CognitoUserSession) => {
          const newTokens: AuthTokens = {
            accessToken: session.getAccessToken().getJwtToken(),
            idToken: session.getIdToken().getJwtToken(),
            refreshToken: session.getRefreshToken().getToken(),
          };

          setTokens(newTokens);
          setUser(extractUserFromSession(session));
          resolve({ success: true });
        },
        onFailure: (err) => {
          console.error("Login failed:", err);
          resolve({
            success: false,
            error: err.message || "Authentication failed",
          });
        },
        newPasswordRequired: () => {
          // Handle new password required scenario
          resolve({
            success: false,
            error: "New password required. Please contact administrator.",
          });
        },
      });
    });
  };

  // Logout
  const logout = async (): Promise<void> => {
    if (!USE_MOCK_AUTH && userPool) {
      const cognitoUser = userPool.getCurrentUser();
      if (cognitoUser) {
        cognitoUser.signOut();
      }
    }
    setUser(null);
    setTokens(null);
  };

  // Get current access token (refreshes if needed)
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    // Mock mode - return mock token
    if (USE_MOCK_AUTH) {
      return MOCK_TOKENS.accessToken;
    }

    if (!userPool) {
      return null;
    }

    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      return null;
    }

    return new Promise((resolve) => {
      cognitoUser.getSession(
        (err: Error | null, session: CognitoUserSession | null) => {
          if (err || !session || !session.isValid()) {
            resolve(null);
            return;
          }
          resolve(session.getAccessToken().getJwtToken());
        }
      );
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        loading,
        login,
        logout,
        refreshSession,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
