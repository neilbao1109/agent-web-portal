import { useState, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  CircularProgress,
  TextField,
  FormControlLabel,
  Switch,
  IconButton,
  Chip,
} from "@mui/material";
import {
  Add as AddIcon,
  ContentCopy as CopyIcon,
  ConfirmationNumber as TicketIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";

interface CreatedTicket {
  id: string;
  endpoint: string;
  expiresAt: string;
  shard: string;
  scope: string | string[];
  writable: boolean | { quota?: number; accept?: string[] };
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

export default function Tickets() {
  const { getAccessToken, user } = useAuth();
  const [error, setError] = useState("");

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTicketScope, setNewTicketScope] = useState("");
  const [newTicketWritable, setNewTicketWritable] = useState(false);
  const [newTicketExpiresIn, setNewTicketExpiresIn] = useState("3600"); // 1 hour
  const [creating, setCreating] = useState(false);

  // Created ticket dialog state
  const [createdTicket, setCreatedTicket] = useState<CreatedTicket | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCreateClick = () => {
    setNewTicketScope("");
    setNewTicketWritable(false);
    setNewTicketExpiresIn("3600");
    setCreateDialogOpen(true);
  };

  const handleCreateConfirm = async () => {
    if (!newTicketScope.trim()) {
      setError("Scope is required (DAG root key)");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        return;
      }

      // Parse scope - support comma-separated values
      const scopeValues = newTicketScope
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      const scope = scopeValues.length === 1 ? scopeValues[0] : scopeValues;

      const response = await fetch("/api/auth/ticket", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope,
          writable: newTicketWritable || undefined,
          expiresIn: parseInt(newTicketExpiresIn, 10),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCreateDialogOpen(false);
        setCreatedTicket(data);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to create ticket");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (field: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

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
            Tickets
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create access tickets for CAS blob operations
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateClick}
          >
            Create Ticket
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent sx={{ textAlign: "center", py: 8 }}>
          <TicketIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            Create Tickets for Blob Access
          </Typography>
          <Typography
            variant="body2"
            color="text.disabled"
            sx={{ mb: 3, maxWidth: 500, mx: "auto" }}
          >
            Tickets provide temporary access to CAS blobs. Create a ticket with a
            scope (DAG root key) to allow reading or writing blobs. The ticket
            endpoint URL can be used as the <code>#cas-endpoint</code> field in
            blob references.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateClick}
          >
            Create Ticket
          </Button>
        </CardContent>
      </Card>

      {/* Create Ticket Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Access Ticket</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Create a ticket to grant temporary access to CAS blobs. The scope
            defines which DAG roots can be accessed.
          </DialogContentText>
          <TextField
            autoFocus
            label="Scope (DAG Root Key)"
            fullWidth
            required
            value={newTicketScope}
            onChange={(e) => setNewTicketScope(e.target.value)}
            sx={{ mb: 2 }}
            placeholder="sha256:abc123... or comma-separated keys"
            helperText="Enter one or more DAG root keys (comma-separated for multiple)"
          />
          <FormControlLabel
            control={
              <Switch
                checked={newTicketWritable}
                onChange={(e) => setNewTicketWritable(e.target.checked)}
              />
            }
            label="Writable (allow uploading new blobs)"
            sx={{ mb: 2, display: "block" }}
          />
          <TextField
            label="Expires In"
            select
            fullWidth
            value={newTicketExpiresIn}
            onChange={(e) => setNewTicketExpiresIn(e.target.value)}
            SelectProps={{ native: true }}
          >
            <option value="300">5 minutes</option>
            <option value="900">15 minutes</option>
            <option value="1800">30 minutes</option>
            <option value="3600">1 hour</option>
            <option value="7200">2 hours</option>
            <option value="21600">6 hours</option>
            <option value="43200">12 hours</option>
            <option value="86400">24 hours</option>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateConfirm}
            variant="contained"
            disabled={creating || !newTicketScope.trim()}
          >
            {creating ? <CircularProgress size={24} /> : "Create Ticket"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Created Ticket Dialog */}
      <Dialog
        open={!!createdTicket}
        onClose={() => setCreatedTicket(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Ticket Created</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 3 }}>
            Use the endpoint URL as the <code>#cas-endpoint</code> field in blob
            references. The ticket will expire at the specified time.
          </Alert>

          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Endpoint URL (for #cas-endpoint)
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                bgcolor: "primary.50",
                border: "1px solid",
                borderColor: "primary.200",
                p: 1.5,
                borderRadius: 1,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  flex: 1,
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  color: "primary.main",
                  fontWeight: 500,
                }}
              >
                {createdTicket?.endpoint}
              </Typography>
              <IconButton
                size="small"
                onClick={() =>
                  handleCopy("endpoint", createdTicket?.endpoint || "")
                }
                color="primary"
              >
                <CopyIcon fontSize="small" />
              </IconButton>
            </Box>
            {copiedField === "endpoint" && (
              <Typography variant="caption" color="success.main">
                Copied to clipboard!
              </Typography>
            )}
          </Box>

          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 3 }}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Ticket ID
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                  {createdTicket?.id}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => handleCopy("id", createdTicket?.id || "")}
                >
                  <CopyIcon fontSize="inherit" />
                </IconButton>
              </Box>
              {copiedField === "id" && (
                <Typography variant="caption" color="success.main">
                  Copied!
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Shard
              </Typography>
              <Typography variant="body2">{createdTicket?.shard}</Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Expires At
              </Typography>
              <Typography variant="body2">
                {createdTicket?.expiresAt
                  ? formatDate(createdTicket.expiresAt)
                  : "-"}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Scope
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {Array.isArray(createdTicket?.scope) ? (
                createdTicket.scope.map((s, i) => (
                  <Chip
                    key={i}
                    label={s}
                    size="small"
                    sx={{ fontFamily: "monospace" }}
                  />
                ))
              ) : (
                <Chip
                  label={createdTicket?.scope}
                  size="small"
                  sx={{ fontFamily: "monospace" }}
                />
              )}
            </Box>
          </Box>

          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Permissions
            </Typography>
            <Chip
              label={createdTicket?.writable ? "Read & Write" : "Read Only"}
              color={createdTicket?.writable ? "success" : "default"}
              size="small"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreatedTicket(null)} variant="contained">
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
