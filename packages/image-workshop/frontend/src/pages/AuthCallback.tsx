import { useEffect, useState } from "react";
import { Box, CircularProgress, Typography, Alert } from "@mui/material";
import { COGNITO_OAUTH_TOKENS_KEY } from "../contexts/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getParams(): URLSearchParams {
  return new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
}

export default function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = getParams();
    const code = params.get("code");
    const state = params.get("state");
    const errorParam = params.get("error");
    const errorDesc = params.get("error_description");
    const returnUrl = state ? decodeURIComponent(state) : "/";

    if (errorParam) {
      setError(errorDesc || errorParam || "Sign-in failed");
      return;
    }

    if (!code) {
      setError("Missing authorization code. Make sure Cognito redirects to this page with ?code=... in the URL.");
      return;
    }

    const redirectUri = window.location.origin + "/auth/callback";

    // Use our API to exchange code for tokens (avoids CORS - Cognito token endpoint doesn't allow browser)
    fetch(`${API_BASE}/api/auth/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(new Error((d as { error?: string })?.error || res.statusText)));
        return res.json();
      })
      .then((data: { id_token: string; access_token: string; refresh_token?: string }) => {
        sessionStorage.setItem(
          COGNITO_OAUTH_TOKENS_KEY,
          JSON.stringify({
            idToken: data.id_token,
            accessToken: data.access_token,
            refreshToken: data.refresh_token || "",
          })
        );
        window.location.href = returnUrl;
      })
      .catch((err) => {
        setError(err?.message || "Token exchange failed");
      });
  }, []);

  if (error) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
        }}
      >
        <Alert severity="error" sx={{ maxWidth: 480 }}>
          {error}
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          <a href="/login">Back to login</a>
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Signing you in...
      </Typography>
    </Box>
  );
}
