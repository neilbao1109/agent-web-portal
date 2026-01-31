import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import {
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";
import { API_URL } from "../utils/api";

/** SessionStorage key for OAuth (Hosted UI / Google) tokens */
export const COGNITO_OAUTH_TOKENS_KEY = "cognito_oauth_tokens";

export interface AuthConfig {
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoHostedUiUrl: string;
}

async function fetchAuthConfig(): Promise<AuthConfig> {
  const base = API_URL || "";
  const res = await fetch(`${base}/api/auth/config`);
  if (!res.ok) throw new Error(`Failed to load auth config: ${res.status}`);
  const data = (await res.json()) as AuthConfig;
  return {
    cognitoUserPoolId: data.cognitoUserPoolId ?? "",
    cognitoClientId: data.cognitoClientId ?? "",
    cognitoHostedUiUrl: data.cognitoHostedUiUrl ?? "",
  };
}

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
  authConfig: AuthConfig | null;
  loginWithGoogle: () => void;
  loginWithMicrosoft: () => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  googleSignInEnabled: boolean;
  microsoftSignInEnabled: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function parseJwt(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
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
  return extractUserFromIdToken(idToken);
}

function extractUserFromIdToken(idToken: string): User {
  const payload = parseJwt(idToken);
  return {
    userId: (payload.sub as string) || "",
    email: (payload.email as string) || "",
    name: (payload.name as string) || (payload.email as string) || "",
  };
}

function getStoredOAuthTokens(): AuthTokens | null {
  try {
    const raw = sessionStorage.getItem(COGNITO_OAUTH_TOKENS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { idToken: string; accessToken: string; refreshToken: string };
    if (!data.idToken || !data.accessToken) return null;
    const payload = parseJwt(data.idToken);
    const exp = (payload.exp as number) | 0;
    if (exp > 0 && exp * 1000 < Date.now()) return null; // expired
    return { idToken: data.idToken, accessToken: data.accessToken, refreshToken: data.refreshToken };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const userPoolRef = useRef<CognitoUserPool | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [loading, setLoading] = useState(true);

  // Create user pool when config is loaded
  useEffect(() => {
    if (!authConfig?.cognitoUserPoolId || !authConfig?.cognitoClientId) {
      userPoolRef.current = null;
      return;
    }
    userPoolRef.current = new CognitoUserPool({
      UserPoolId: authConfig.cognitoUserPoolId,
      ClientId: authConfig.cognitoClientId,
    });
  }, [authConfig]);

  const getUserPool = (): CognitoUserPool | null => userPoolRef.current;

  // Refresh session: prefer stored OAuth tokens, then Cognito user session
  const refreshSession = useCallback(async (): Promise<void> => {
    const oauthTokens = getStoredOAuthTokens();
    if (oauthTokens) {
      setTokens(oauthTokens);
      setUser(extractUserFromIdToken(oauthTokens.idToken));
      return;
    }

    const userPool = getUserPool();
    if (!userPool) {
      setUser(null);
      setTokens(null);
      return;
    }

    return new Promise((resolve) => {
      const cognitoUser = userPool.getCurrentUser();
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

  const loginWithIdP = useCallback(
    (identityProvider: string): void => {
      if (!authConfig?.cognitoClientId || !authConfig?.cognitoHostedUiUrl) {
        console.warn(`[Auth] ${identityProvider} sign-in not configured (missing Cognito config).`);
        alert(`${identityProvider} sign-in is not configured. Please contact an administrator.`);
        return;
      }
      const returnUrl = encodeURIComponent(
        window.location.pathname === "/login"
          ? new URLSearchParams(window.location.search).get("returnUrl") || "/"
          : window.location.pathname + window.location.search
      );
      const redirectUri = window.location.origin + "/auth/callback";
      const scope = "openid email profile";
      const params = new URLSearchParams({
        client_id: authConfig.cognitoClientId,
        response_type: "code",
        scope,
        redirect_uri: redirectUri,
        state: returnUrl,
        identity_provider: identityProvider,
      });
      window.location.href = `${authConfig.cognitoHostedUiUrl}/oauth2/authorize?${params.toString()}`;
    },
    [authConfig]
  );

  const loginWithGoogle = useCallback((): void => loginWithIdP("Google"), [loginWithIdP]);
  const loginWithMicrosoft = useCallback((): void => loginWithIdP("Microsoft"), [loginWithIdP]);

  const logout = useCallback(async (): Promise<void> => {
    sessionStorage.removeItem(COGNITO_OAUTH_TOKENS_KEY);
    const userPool = getUserPool();
    if (userPool) {
      const cognitoUser = userPool.getCurrentUser();
      if (cognitoUser) cognitoUser.signOut();
    }
    setUser(null);
    setTokens(null);
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const oauthTokens = getStoredOAuthTokens();
    if (oauthTokens) return oauthTokens.accessToken;

    const userPool = getUserPool();
    if (!userPool) return null;

    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return null;

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

  // Load auth config from API, then check session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await fetchAuthConfig();
        if (!cancelled) setAuthConfig(config);
      } catch (err) {
        console.error("[Auth] Failed to load auth config:", err);
        if (!cancelled) setAuthConfig({ cognitoUserPoolId: "", cognitoClientId: "", cognitoHostedUiUrl: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // After config is set (or failed), check session and set loading false
  useEffect(() => {
    if (authConfig === null) return; // still loading config
    const checkSession = async () => {
      await refreshSession();
      setLoading(false);
    };
    checkSession();
  }, [authConfig, refreshSession]);

  const hostedUiConfigured = Boolean(authConfig?.cognitoClientId && authConfig?.cognitoHostedUiUrl);

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        loading,
        authConfig,
        loginWithGoogle,
        loginWithMicrosoft,
        logout,
        refreshSession,
        getAccessToken,
        googleSignInEnabled: hostedUiConfigured,
        microsoftSignInEnabled: hostedUiConfigured,
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
