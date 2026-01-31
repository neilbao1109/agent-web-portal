import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Stack,
} from "@mui/material";
import { Palette as PaletteIcon } from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";

// Google icon for Sign in with Google
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// Microsoft icon for Sign in with Microsoft
function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    user,
    loginWithGoogle,
    loginWithMicrosoft,
    googleSignInEnabled,
    microsoftSignInEnabled,
    loading: authLoading,
  } = useAuth();

  const returnUrl = searchParams.get("returnUrl") || "/";
  const anySignInEnabled = googleSignInEnabled || microsoftSignInEnabled;

  // If already logged in, redirect
  useEffect(() => {
    if (!authLoading && user) {
      navigate(decodeURIComponent(returnUrl), { replace: true });
    }
  }, [user, authLoading, navigate, returnUrl]);

  if (authLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #7c4dff 0%, #ff4081 100%)",
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 420, width: "100%" }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #7c4dff 0%, #ff4081 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: 2,
                boxShadow: "0 4px 20px rgba(124, 77, 255, 0.3)",
              }}
            >
              <PaletteIcon sx={{ fontSize: 36, color: "white" }} />
            </Box>
            <Typography variant="h5" fontWeight={700}>
              Image Workshop
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Sign in to manage your AI image generation tools
            </Typography>
          </Box>

          {!anySignInEnabled && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              No sign-in method is configured. Please contact an administrator.
            </Alert>
          )}

          <Stack spacing={2}>
            {microsoftSignInEnabled && (
              <Button
                type="button"
                fullWidth
                variant="contained"
                size="large"
                onClick={loginWithMicrosoft}
                startIcon={<MicrosoftIcon />}
                sx={{
                  py: 1.5,
                  background: "white",
                  color: "text.primary",
                  border: "1px solid",
                  borderColor: "grey.300",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  "&:hover": {
                    background: "grey.50",
                    borderColor: "grey.400",
                  },
                }}
              >
                Sign in with Microsoft
              </Button>
            )}

            {googleSignInEnabled && (
              <Button
                type="button"
                fullWidth
                variant="contained"
                size="large"
                onClick={loginWithGoogle}
                startIcon={<GoogleIcon />}
                sx={{
                  py: 1.5,
                  background: "white",
                  color: "text.primary",
                  border: "1px solid",
                  borderColor: "grey.300",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  "&:hover": {
                    background: "grey.50",
                    borderColor: "grey.400",
                  },
                }}
              >
                Sign in with Google
              </Button>
            )}
          </Stack>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 3, textAlign: "center" }}
          >
            Sign in with your organization account
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
