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
} from "@mui/material";
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Computer as ComputerIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { apiRequest } from "../utils/api";

interface AwpClient {
  pubkey: string;
  clientName: string;
  createdAt: string;
  expiresAt: string | null;
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return Date.now() > new Date(expiresAt).getTime();
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  const expiresTime = new Date(expiresAt).getTime();
  return !isExpired(expiresAt) && expiresTime - Date.now() < threeDays;
}

function truncatePubkey(pubkey: string): string {
  if (pubkey.length <= 20) return pubkey;
  return `${pubkey.slice(0, 12)}...${pubkey.slice(-8)}`;
}

export default function Clients() {
  const { getAccessToken } = useAuth();
  const [clients, setClients] = useState<AwpClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<AwpClient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        return;
      }

      const response = await apiRequest("/api/auth/agent-tokens/clients", {}, accessToken);

      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to load clients");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleDeleteClick = (client: AwpClient) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!clientToDelete) return;

    setDeleting(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        return;
      }

      const response = await apiRequest(
        `/api/auth/agent-tokens/clients/${encodeURIComponent(clientToDelete.pubkey)}`,
        {
          method: "DELETE",
        },
        accessToken
      );

      if (response.ok) {
        setClients((prev) =>
          prev.filter((c) => c.pubkey !== clientToDelete.pubkey)
        );
        setDeleteDialogOpen(false);
        setClientToDelete(null);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to revoke client");
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
            Authorized Clients
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage AI agents that have access to your CAS storage
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchClients}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {clients.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 8 }}>
            <ComputerIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No authorized clients
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
              When you authorize an AI agent, it will appear here
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {clients.map((client) => {
            const expired = isExpired(client.expiresAt);
            const expiringSoon = isExpiringSoon(client.expiresAt);

            return (
              <Card
                key={client.pubkey}
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
                        <ComputerIcon sx={{ color: "primary.main" }} />
                        <Typography variant="h6" fontWeight={600}>
                          {client.clientName}
                        </Typography>
                        {expired && (
                          <Typography
                            variant="caption"
                            sx={{
                              bgcolor: "error.light",
                              color: "error.contrastText",
                              px: 1,
                              py: 0.25,
                              borderRadius: 1,
                            }}
                          >
                            Expired
                          </Typography>
                        )}
                      </Box>

                      <Tooltip title={client.pubkey}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: "monospace",
                            color: "text.secondary",
                            mb: 2,
                          }}
                        >
                          {truncatePubkey(client.pubkey)}
                        </Typography>
                      </Tooltip>

                      <Box
                        sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}
                      >
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            Authorized
                          </Typography>
                          <Typography variant="body2">
                            {formatDate(client.createdAt)}
                          </Typography>
                        </Box>
                        {client.expiresAt && (
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
                              {formatDate(client.expiresAt)}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>

                    <Box>
                      <Tooltip title="Revoke access">
                        <IconButton
                          color="error"
                          onClick={() => handleDeleteClick(client)}
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Revoke Client Access</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to revoke access for{" "}
            <strong>{clientToDelete?.clientName}</strong>?
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            This action cannot be undone. The AI agent will need to be
            re-authorized to access your CAS storage.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? <CircularProgress size={24} /> : "Revoke Access"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
