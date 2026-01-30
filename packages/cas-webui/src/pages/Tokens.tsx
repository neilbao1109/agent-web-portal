import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  CircularProgress,
  Tooltip,
  TextField,
  Chip,
} from "@mui/material";
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Key as KeyIcon,
  Add as AddIcon,
  ContentCopy as CopyIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { apiRequest } from "../utils/api";

interface AgentToken {
  id: string;
  name: string;
  description?: string;
  expiresAt: string;
  createdAt: string;
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function isExpired(expiresAt: string): boolean {
  return Date.now() > new Date(expiresAt).getTime();
}

function isExpiringSoon(expiresAt: string): boolean {
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  const expiresTime = new Date(expiresAt).getTime();
  return !isExpired(expiresAt) && expiresTime - Date.now() < threeDays;
}

function truncateId(id: string): string {
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}...${id.slice(-8)}`;
}

export default function Tokens() {
  const { getAccessToken } = useAuth();
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenDescription, setNewTokenDescription] = useState("");
  const [newTokenExpiresIn, setNewTokenExpiresIn] = useState("2592000"); // 30 days
  const [creating, setCreating] = useState(false);

  // Created token dialog state
  const [createdToken, setCreatedToken] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<AgentToken | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        return;
      }

      const response = await apiRequest("/api/auth/tokens", {}, accessToken);

      if (response.ok) {
        const data = await response.json();
        setTokens(data.tokens || []);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to load agent tokens");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleCreateClick = () => {
    setNewTokenName("");
    setNewTokenDescription("");
    setNewTokenExpiresIn("2592000");
    setCreateDialogOpen(true);
  };

  const handleCreateConfirm = async () => {
    if (!newTokenName.trim()) {
      setError("Token name is required");
      return;
    }

    setCreating(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        return;
      }

      const response = await apiRequest(
        "/api/auth/tokens",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: newTokenName.trim(),
            description: newTokenDescription.trim() || undefined,
            expiresIn: parseInt(newTokenExpiresIn, 10),
          }),
        },
        accessToken
      );

      if (response.ok) {
        const data = await response.json();
        setCreateDialogOpen(false);
        setCreatedToken({ id: data.id, name: data.name });
        fetchTokens();
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to create agent token");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleCopyToken = async () => {
    if (createdToken) {
      await navigator.clipboard.writeText(createdToken.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDeleteClick = (token: AgentToken) => {
    setTokenToDelete(token);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tokenToDelete) return;

    setDeleting(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        return;
      }

      const response = await apiRequest(
        `/api/auth/tokens/${encodeURIComponent(tokenToDelete.id)}`,
        {
          method: "DELETE",
        },
        accessToken
      );

      if (response.ok) {
        setTokens((prev) => prev.filter((t) => t.id !== tokenToDelete.id));
        setDeleteDialogOpen(false);
        setTokenToDelete(null);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to revoke agent token");
      }
    } catch {
      setError("Network error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom>
            Agent Tokens
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage API tokens for programmatic access to CAS
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchTokens}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateClick}
          >
            Create Token
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {tokens.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 8 }}>
            <KeyIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No agent tokens
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
              Create a token to access CAS programmatically
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreateClick}
            >
              Create Token
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {tokens.map((token) => {
            const expired = isExpired(token.expiresAt);
            const expiringSoon = isExpiringSoon(token.expiresAt);

            return (
              <Card
                key={token.id}
                sx={{
                  opacity: expired ? 0.7 : 1,
                  borderLeft: expired
                    ? "4px solid #f44336"
                    : expiringSoon
                      ? "4px solid #ff9800"
                      : "4px solid #4caf50",
                }}
              >
                <CardContent>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: 1,
                        }}
                      >
                        <KeyIcon sx={{ color: "primary.main" }} />
                        <Typography variant="h6" fontWeight={600}>
                          {token.name}
                        </Typography>
                        {expired && (
                          <Chip
                            label="Expired"
                            size="small"
                            color="error"
                          />
                        )}
                        {expiringSoon && !expired && (
                          <Chip
                            label="Expiring Soon"
                            size="small"
                            color="warning"
                          />
                        )}
                      </Box>

                      {token.description && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mb: 1 }}
                        >
                          {token.description}
                        </Typography>
                      )}

                      <Tooltip title={token.id}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: "monospace",
                            color: "text.secondary",
                            mb: 2,
                          }}
                        >
                          ID: {truncateId(token.id)}
                        </Typography>
                      </Tooltip>

                      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            Created
                          </Typography>
                          <Typography variant="body2">
                            {formatDate(token.createdAt)}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            Expires
                          </Typography>
                          <Typography
                            variant="body2"
                            color={
                              expired
                                ? "error.main"
                                : expiringSoon
                                  ? "warning.main"
                                  : "text.primary"
                            }
                          >
                            {formatDate(token.expiresAt)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    <Box>
                      <Tooltip title="Revoke token">
                        <IconButton
                          color="error"
                          onClick={() => handleDeleteClick(token)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Create Token Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Agent Token</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Create a new API token for programmatic access to CAS. The token will
            inherit your full permissions.
          </DialogContentText>
          <TextField
            autoFocus
            label="Token Name"
            fullWidth
            required
            value={newTokenName}
            onChange={(e) => setNewTokenName(e.target.value)}
            sx={{ mb: 2 }}
            placeholder="e.g., Production MCP Server"
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            rows={2}
            value={newTokenDescription}
            onChange={(e) => setNewTokenDescription(e.target.value)}
            sx={{ mb: 2 }}
            placeholder="Optional description for this token"
          />
          <TextField
            label="Expires In"
            select
            fullWidth
            value={newTokenExpiresIn}
            onChange={(e) => setNewTokenExpiresIn(e.target.value)}
            SelectProps={{ native: true }}
          >
            <option value="86400">1 day</option>
            <option value="604800">7 days</option>
            <option value="2592000">30 days</option>
            <option value="7776000">90 days</option>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateConfirm}
            variant="contained"
            disabled={creating || !newTokenName.trim()}
          >
            {creating ? <CircularProgress size={24} /> : "Create Token"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Created Token Dialog */}
      <Dialog
        open={!!createdToken}
        onClose={() => setCreatedToken(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Token Created</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Make sure to copy the token ID now. You won't be able to see it again!
          </Alert>
          <Typography variant="subtitle2" gutterBottom>
            Token Name
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {createdToken?.name}
          </Typography>
          <Typography variant="subtitle2" gutterBottom>
            Token ID
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              bgcolor: "grey.100",
              p: 1.5,
              borderRadius: 1,
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            <Typography variant="body2" sx={{ flex: 1, fontFamily: "monospace" }}>
              {createdToken?.id}
            </Typography>
            <IconButton size="small" onClick={handleCopyToken}>
              <CopyIcon fontSize="small" />
            </IconButton>
          </Box>
          {copied && (
            <Typography variant="caption" color="success.main" sx={{ mt: 1, display: "block" }}>
              Copied to clipboard!
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreatedToken(null)} variant="contained">
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Revoke Agent Token</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to revoke the token{" "}
            <strong>{tokenToDelete?.name}</strong>?
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            This action cannot be undone. Any applications using this token will
            lose access immediately.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? <CircularProgress size={24} /> : "Revoke Token"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
