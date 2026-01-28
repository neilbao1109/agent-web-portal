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
import { Add, Delete, Refresh, Link as LinkIcon, Edit } from '@mui/icons-material';
import type { RegisteredEndpoint } from '../core';

export interface EndpointManagerProps {
  endpoints: RegisteredEndpoint[];
  isLoading: boolean;
  onRegister: (url: string, alias?: string) => Promise<unknown>;
  onUpdate: (endpointId: string, url: string, alias?: string) => Promise<unknown>;
  onUnregister: (endpointId: string) => void;
  onRefresh: () => Promise<void>;
}

export function EndpointManager({
  endpoints,
  isLoading,
  onRegister,
  onUpdate,
  onUnregister,
  onRefresh,
}: EndpointManagerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<RegisteredEndpoint | null>(null);
  const [url, setUrl] = useState('');
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setUrl('');
    setAlias('');
    setEditingEndpoint(null);
    setError(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (endpoint: RegisteredEndpoint) => {
    setEditingEndpoint(endpoint);
    setUrl(endpoint.url);
    setAlias(endpoint.alias || '');
    setError(null);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleSave = async () => {
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
    setSaving(true);

    try {
      if (editingEndpoint) {
        await onUpdate(editingEndpoint.endpointId, url.trim(), alias.trim() || undefined);
      } else {
        await onRegister(url.trim(), alias.trim() || undefined);
      }
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save endpoint');
    } finally {
      setSaving(false);
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
            onClick={handleOpenAdd}
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
                flexDirection: 'row',
                alignItems: 'center',
                gap: 1,
                py: 1,
                px: 1.5,
              }}
            >
              <ListItemText
                primary={
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 0.5, 
                    flexWrap: 'wrap',
                  }}>
                    <Typography variant="body2" fontWeight="medium" noWrap>
                      {endpoint.alias || endpoint.endpointId}
                    </Typography>
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
                    noWrap
                    sx={{ 
                      fontFamily: 'monospace', 
                      fontSize: { xs: '0.65rem', sm: '0.75rem' },
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={endpoint.url}
                  >
                    {endpoint.url}
                  </Typography>
                }
                sx={{ my: 0, minWidth: 0, flex: 1 }}
              />
              <Box sx={{
                display: 'flex',
                gap: 0.5,
                flexShrink: 0,
              }}>
                <IconButton
                  onClick={() => handleOpenEdit(endpoint)}
                  title="Edit endpoint"
                  size="small"
                >
                  <Edit fontSize="small" />
                </IconButton>
                <IconButton
                  onClick={() => onUnregister(endpoint.endpointId)}
                  title="Remove endpoint"
                  size="small"
                >
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
            </ListItem>
          ))}
        </List>
      )}

      {/* Add/Edit Endpoint Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleClose} 
        maxWidth="sm" 
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>{editingEndpoint ? 'Edit AWP Endpoint' : 'Add AWP Endpoint'}</DialogTitle>
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
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? 'Saving...' : (editingEndpoint ? 'Save' : 'Add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
