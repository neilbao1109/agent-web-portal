/**
 * Endpoint Manager
 *
 * Component for managing AWP endpoints
 */

import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Paper,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Add, Delete, Refresh, Link as LinkIcon } from '@mui/icons-material';
import type { RegisteredEndpoint } from '../core';

export interface EndpointManagerProps {
  endpoints: RegisteredEndpoint[];
  isLoading: boolean;
  onRegister: (url: string, alias?: string) => Promise<unknown>;
  onUnregister: (endpointId: string) => void;
  onRefresh: () => Promise<void>;
}

export function EndpointManager({
  endpoints,
  isLoading,
  onRegister,
  onUnregister,
  onRefresh,
}: EndpointManagerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const handleRegister = async () => {
    if (!url.trim()) {
      setError('URL is required');
      return;
    }

    try {
      new URL(url);
    } catch {
      setError('Invalid URL format');
      return;
    }

    setError(null);
    setRegistering(true);

    try {
      await onRegister(url.trim(), alias.trim() || undefined);
      setDialogOpen(false);
      setUrl('');
      setAlias('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register endpoint');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
          AWP Endpoints
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton onClick={onRefresh} disabled={isLoading} title="Refresh" size="small">
            <Refresh />
          </IconButton>
          <Button
            startIcon={<Add />}
            variant="outlined"
            size="small"
            onClick={() => setDialogOpen(true)}
          >
            Add
          </Button>
        </Box>
      </Box>

      {endpoints.length === 0 ? (
        <Paper sx={{ p: { xs: 2, sm: 3 }, textAlign: 'center' }} variant="outlined">
          <LinkIcon sx={{ fontSize: { xs: 36, sm: 48 }, color: 'text.secondary', mb: 1 }} />
          <Typography color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
            No endpoints registered. Add an AWP endpoint to get started.
          </Typography>
        </Paper>
      ) : (
        <List disablePadding>
          {endpoints.map((endpoint) => (
            <ListItem
              key={endpoint.endpointId}
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                mb: 1,
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                pr: isMobile ? 1 : 6,
                position: 'relative',
              }}
            >
              <ListItemText
                primary={
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 0.5, 
                    flexWrap: 'wrap',
                    pr: isMobile ? 4 : 0,
                  }}>
                    <Typography variant="body2" fontWeight="medium" noWrap sx={{ maxWidth: '100%' }}>
                      {endpoint.alias || endpoint.endpointId}
                    </Typography>
                    {!isMobile && (
                      <Chip
                        label={endpoint.endpointId}
                        size="small"
                        variant="outlined"
                        sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}
                      />
                    )}
                    <Chip
                      label={endpoint.isAuthenticated ? 'Auth' : 'No Auth'}
                      size="small"
                      color={endpoint.isAuthenticated ? 'success' : 'warning'}
                      sx={{ fontSize: '0.65rem', height: 20 }}
                    />
                  </Box>
                }
                secondary={
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ 
                      fontFamily: 'monospace', 
                      fontSize: { xs: '0.65rem', sm: '0.75rem' },
                      wordBreak: 'break-all',
                    }}
                  >
                    {endpoint.url}
                  </Typography>
                }
                sx={{ my: 0 }}
              />
              <IconButton
                onClick={() => onUnregister(endpoint.endpointId)}
                title="Remove endpoint"
                size="small"
                sx={{
                  position: isMobile ? 'absolute' : 'static',
                  top: isMobile ? 8 : 'auto',
                  right: isMobile ? 8 : 'auto',
                }}
              >
                <Delete fontSize="small" />
              </IconButton>
            </ListItem>
          ))}
        </List>
      )}

      {/* Add Endpoint Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Add AWP Endpoint</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Endpoint URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              fullWidth
              placeholder="https://example.com/api/awp"
              autoFocus
              sx={{
                '& .MuiInputBase-root': {
                  fontSize: { xs: '16px', sm: 'inherit' },
                },
              }}
            />

            <TextField
              label="Alias (optional)"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              fullWidth
              placeholder="My Portal"
              helperText="A friendly name for this endpoint"
              sx={{
                '& .MuiInputBase-root': {
                  fontSize: { xs: '16px', sm: 'inherit' },
                },
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRegister} variant="contained" disabled={registering}>
            {registering ? 'Adding...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
