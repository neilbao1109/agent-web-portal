import { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  CircularProgress,
  Chip,
} from "@mui/material";
import {
  Delete as DeleteIcon,
  Computer as ComputerIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";

interface Client {
  pubkey: string;
  clientName: string;
  createdAt: string;
  expiresAt: string | null;
}

export default function Clients() {
  const { getAccessToken } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchClients = async () => {
    try {
      setLoading(true);
      setError("");
      const token = await getAccessToken();
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const response = await fetch("/api/auth/agent-tokens/clients", {
        headers: { Authorization: `Bearer ${token}` },
      });

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
  };

  useEffect(() => {
    fetchClients();
  }, [getAccessToken]);

  const handleDelete = async (pubkey: string) => {
    setDeleting(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch(
        `/api/auth/agent-tokens/clients/${encodeURIComponent(pubkey)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        setClients((prev) => prev.filter((c) => c.pubkey !== pubkey));
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to revoke client");
      }
    } catch {
      setError("Network error");
    } finally {
      setDeleting(false);
      setDeleteDialog(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            AI Clients
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage authorized AI agents that can use Image Workshop
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 8 }}>
            <ComputerIcon sx={{ fontSize: 64, color: "grey.400", mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No AI Clients
            </Typography>
            <Typography variant="body2" color="text.secondary">
              When you authorize an AI agent to use Image Workshop, it will appear here.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Client Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Authorized</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.pubkey}>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <ComputerIcon sx={{ color: "grey.500" }} />
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {client.clientName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                          {client.pubkey.slice(0, 16)}...
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {isExpired(client.expiresAt) ? (
                      <Chip label="Expired" size="small" color="error" />
                    ) : (
                      <Chip label="Active" size="small" color="success" />
                    )}
                  </TableCell>
                  <TableCell>{formatDate(client.createdAt)}</TableCell>
                  <TableCell>
                    {client.expiresAt ? formatDate(client.expiresAt) : "Never"}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      color="error"
                      onClick={() => setDeleteDialog(client.pubkey)}
                      size="small"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog !== null}
        onClose={() => setDeleteDialog(null)}
      >
        <DialogTitle>Revoke Access?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will immediately revoke this AI agent's access to Image Workshop.
            The agent will need to be re-authorized to use the service again.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={() => deleteDialog && handleDelete(deleteDialog)}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? <CircularProgress size={24} /> : "Revoke"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
