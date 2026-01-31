import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Paper,
} from "@mui/material";
import {
  Check as CheckIcon,
  Close as CloseIcon,
  Computer as ComputerIcon,
} from "@mui/icons-material";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface PendingAuth {
  pubkey: string;
  clientName: string;
  verificationCode: string;
  expiresAt: number;
}

export default function AwpAuth() {
  const { user, getAccessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const pubkey = searchParams.get("pubkey") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const [enteredCode, setEnteredCode] = useState("");
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [denied, setDenied] = useState(false);

  // Fetch pending auth info
  const fetchPendingAuth = useCallback(async () => {
    if (!pubkey) {
      setError("Missing pubkey parameter");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Check if already authorized
      const response = await fetch(
        `/api/auth/agent-tokens/status?pubkey=${encodeURIComponent(pubkey)}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.authorized) {
          setCompleted(true);
          setLoading(false);
          return;
        }

        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }

        // There's a pending auth
        setPendingAuth({
          pubkey,
          clientName: "AI Agent",
          verificationCode: "",
          expiresAt: Date.now() + 600000, // 10 minutes from now
        });
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to check authorization status");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    fetchPendingAuth();
  }, [fetchPendingAuth]);

  // If not logged in, redirect to login with return URL
  useEffect(() => {
    if (!loading && !user) {
      const returnUrl = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      navigate(`/login?returnUrl=${returnUrl}`);
    }
  }, [user, loading, navigate]);

  const handleApprove = async () => {
    if (!enteredCode.trim()) {
      setError("Please enter the verification code");
      return;
    }

    setCompleting(true);
    setError("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        setCompleting(false);
        return;
      }

      const response = await fetch("/api/auth/agent-tokens/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          pubkey,
          verification_code: enteredCode.trim().toUpperCase(),
        }),
      });

      if (response.ok) {
        setCompleted(true);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Authorization failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setCompleting(false);
    }
  };

  const handleDeny = () => {
    setDenied(true);
  };

  // Loading state
  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          bgcolor: "background.default",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Completed state
  if (completed) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          bgcolor: "background.default",
          p: 2,
        }}
      >
        <Card sx={{ maxWidth: 400, width: "100%" }}>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <CheckIcon sx={{ fontSize: 64, color: "success.main", mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Authorization Complete
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              The AI agent has been authorized to use Image Workshop.
              You can close this window.
            </Typography>
            <Button
              variant="outlined"
              onClick={() => navigate("/clients")}
            >
              Manage Clients
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Denied state
  if (denied) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          bgcolor: "background.default",
          p: 2,
        }}
      >
        <Card sx={{ maxWidth: 400, width: "100%" }}>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <CloseIcon sx={{ fontSize: 64, color: "error.main", mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Authorization Denied
            </Typography>
            <Typography color="text.secondary">
              The authorization request has been denied.
              You can close this window.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Error state (no pending auth)
  if (error && !pendingAuth) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          bgcolor: "background.default",
          p: 2,
        }}
      >
        <Card sx={{ maxWidth: 400, width: "100%" }}>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <CloseIcon sx={{ fontSize: 64, color: "error.main", mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Authorization Error
            </Typography>
            <Typography color="text.secondary">
              {error}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Authorization prompt
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 480, width: "100%" }}>
        <CardContent sx={{ py: 4 }}>
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <ComputerIcon sx={{ fontSize: 48, color: "primary.main", mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Authorize AI Agent
            </Typography>
            <Typography color="text.secondary">
              An AI agent is requesting access to Image Workshop.
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Paper
            elevation={0}
            sx={{
              p: 2,
              mb: 3,
              bgcolor: "grey.100",
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              To authorize this agent, enter the verification code shown
              in your AI agent's terminal or interface:
            </Typography>
          </Paper>

          <TextField
            fullWidth
            label="Verification Code"
            placeholder="XXX-XXX"
            value={enteredCode}
            onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
            sx={{ mb: 3 }}
            inputProps={{
              style: {
                textAlign: "center",
                fontSize: "1.5rem",
                fontFamily: "monospace",
                letterSpacing: "0.2em",
              },
            }}
            disabled={completing}
          />

          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="outlined"
              color="error"
              fullWidth
              onClick={handleDeny}
              disabled={completing}
            >
              Deny
            </Button>
            <Button
              variant="contained"
              color="primary"
              fullWidth
              onClick={handleApprove}
              disabled={completing || !enteredCode.trim()}
            >
              {completing ? <CircularProgress size={24} /> : "Authorize"}
            </Button>
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", mt: 3 }}
          >
            This will allow the agent to generate and edit images using Image Workshop.
            You can revoke access at any time from the Clients page.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
