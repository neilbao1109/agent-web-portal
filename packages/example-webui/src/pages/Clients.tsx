import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  Devices as DevicesIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  AccessTime as AccessTimeIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';

interface Client {
  pubkey: string;
  clientName: string;
  createdAt: number;
  expiresAt?: number;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;

  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 60000) return 'just now';
    if (absDiff < 3600000) return `${Math.floor(absDiff / 60000)} min ago`;
    if (absDiff < 86400000) return `${Math.floor(absDiff / 3600000)} hours ago`;
    return `${Math.floor(absDiff / 86400000)} days ago`;
  }

  if (diff < 60000) return 'in < 1 min';
  if (diff < 3600000) return `in ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `in ${Math.floor(diff / 3600000)} hours`;
  return `in ${Math.floor(diff / 86400000)} days`;
}

function isExpired(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  return Date.now() > expiresAt;
}

function isExpiringSoon(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  return !isExpired(expiresAt) && (expiresAt - Date.now()) < threeDays;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Revoke dialog state
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [clientToRevoke, setClientToRevoke] = useState<Client | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Renew dialog state
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [clientToRenew, setClientToRenew] = useState<Client | null>(null);
  const [renewDuration, setRenewDuration] = useState('2592000'); // 30 days
  const [renewing, setRenewing] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/clients');
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients);
        setError('');
      } else {
        setError('Failed to load clients');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleRevokeClick = (client: Client) => {
    setClientToRevoke(client);
    setRevokeDialogOpen(true);
  };

  const handleRevokeConfirm = async () => {
    if (!clientToRevoke) return;

    setRevoking(true);
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientToRevoke.pubkey)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setClients((prev) => prev.filter((c) => c.pubkey !== clientToRevoke.pubkey));
        setRevokeDialogOpen(false);
      } else {
        setError('Failed to revoke client');
      }
    } catch {
      setError('Network error');
    } finally {
      setRevoking(false);
    }
  };

  const handleRenewClick = (client: Client) => {
    setClientToRenew(client);
    setRenewDialogOpen(true);
  };

  const handleRenewConfirm = async () => {
    if (!clientToRenew) return;

    setRenewing(true);
    try {
      const expiresIn = renewDuration ? parseInt(renewDuration, 10) : undefined;
      const response = await fetch(`/api/clients/${encodeURIComponent(clientToRenew.pubkey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn }),
      });

      if (response.ok) {
        const data = await response.json();
        setClients((prev) =>
          prev.map((c) => (c.pubkey === clientToRenew.pubkey ? data.client : c))
        );
        setRenewDialogOpen(false);
      } else {
        setError('Failed to renew client');
      }
    } catch {
      setError('Network error');
    } finally {
      setRenewing(false);
    }
  };

  const truncatePubkey = (pubkey: string) => {
    if (pubkey.length <= 20) return pubkey;
    return `${pubkey.slice(0, 10)}...${pubkey.slice(-8)}`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom>
            Authorized Clients
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage MCP clients that have access to your account
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchClients}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {clients.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <DevicesIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No authorized clients
            </Typography>
            <Typography variant="body2" color="text.disabled">
              When you authorize an MCP client, it will appear here
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {clients.map((client) => {
            const expired = isExpired(client.expiresAt);
            const expiringSoon = isExpiringSoon(client.expiresAt);

            return (
              <Card
                key={client.pubkey}
                sx={{
                  opacity: expired ? 0.7 : 1,
                  borderLeft: expired
                    ? '4px solid #f44336'
                    : expiringSoon
                    ? '4px solid #ff9800'
                    : '4px solid #4caf50',
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography variant="h6" fontWeight={600}>
                          {client.clientName}
                        </Typography>
                        {expired && (
                          <Chip
                            label="Expired"
                            size="small"
                            color="error"
                            icon={<WarningIcon />}
                          />
                        )}
                        {expiringSoon && !expired && (
                          <Chip
                            label="Expiring Soon"
                            size="small"
                            color="warning"
                            icon={<AccessTimeIcon />}
                          />
                        )}
                      </Box>

                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        <Tooltip title={client.pubkey}>
                          <span style={{ fontFamily: 'monospace' }}>
                            Pubkey: {truncatePubkey(client.pubkey)}
                          </span>
                        </Tooltip>
                      </Typography>

                      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        <Typography variant="caption" color="text.secondary">
                          Authorized: {formatDate(client.createdAt)}
                        </Typography>
                        <Typography variant="caption" color={expired ? 'error' : expiringSoon ? 'warning.main' : 'text.secondary'}>
                          {client.expiresAt
                            ? `Expires: ${formatDate(client.expiresAt)} (${formatRelativeTime(client.expiresAt)})`
                            : 'Never expires'}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleRenewClick(client)}
                      >
                        {expired ? 'Reauthorize' : 'Renew'}
                      </Button>
                      <IconButton
                        color="error"
                        onClick={() => handleRevokeClick(client)}
                        title="Revoke"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Revoke Confirmation Dialog */}
      <Dialog open={revokeDialogOpen} onClose={() => setRevokeDialogOpen(false)}>
        <DialogTitle>Revoke Client Authorization?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to revoke authorization for{' '}
            <strong>{clientToRevoke?.clientName}</strong>? This client will no longer be able to
            access tools on your behalf.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeDialogOpen(false)} disabled={revoking}>
            Cancel
          </Button>
          <Button
            onClick={handleRevokeConfirm}
            color="error"
            variant="contained"
            disabled={revoking}
          >
            {revoking ? <CircularProgress size={20} /> : 'Revoke'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Renew Dialog */}
      <Dialog open={renewDialogOpen} onClose={() => setRenewDialogOpen(false)}>
        <DialogTitle>Renew Client Authorization</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Set a new expiration time for <strong>{clientToRenew?.clientName}</strong>.
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>Duration</InputLabel>
            <Select
              value={renewDuration}
              label="Duration"
              onChange={(e) => setRenewDuration(e.target.value)}
            >
              <MenuItem value="86400">1 day</MenuItem>
              <MenuItem value="604800">7 days</MenuItem>
              <MenuItem value="2592000">30 days</MenuItem>
              <MenuItem value="7776000">90 days</MenuItem>
              <MenuItem value="">Never expires</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenewDialogOpen(false)} disabled={renewing}>
            Cancel
          </Button>
          <Button
            onClick={handleRenewConfirm}
            color="primary"
            variant="contained"
            disabled={renewing}
          >
            {renewing ? <CircularProgress size={20} /> : 'Renew'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
