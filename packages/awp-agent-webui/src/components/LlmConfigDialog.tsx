/**
 * LLM Config Components
 *
 * Panel and Dialog for configuring LLM API settings
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Alert,
  IconButton,
  InputAdornment,
  useMediaQuery,
  useTheme,
  Typography,
  Chip,
} from '@mui/material';
import { Visibility, VisibilityOff, Check } from '@mui/icons-material';
import type { LlmConfig } from '../storage';
import { OPENAI_ENDPOINT } from '../core/llm';

type ProviderId = 'openai' | 'anthropic' | 'custom';

const PROVIDER_DEFAULTS: Record<ProviderId, { endpoint: string; models: string[] }> = {
  openai: {
    endpoint: OPENAI_ENDPOINT,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  },
  custom: {
    endpoint: '',
    models: [],
  },
};

// Common input style to prevent iOS zoom
const inputStyle = {
  '& .MuiInputBase-root': {
    fontSize: { xs: '16px', sm: 'inherit' },
  },
};

export interface LlmConfigPanelProps {
  onSave: (config: Omit<LlmConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  currentConfig: LlmConfig | null;
}

/**
 * LLM Config Panel - Embeddable panel for configuring LLM settings
 */
export function LlmConfigPanel({ onSave, currentConfig }: LlmConfigPanelProps) {
  const [providerId, setProviderId] = useState<ProviderId>('openai');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initialize from current config
  useEffect(() => {
    if (currentConfig) {
      setProviderId(currentConfig.providerId);
      setEndpoint(currentConfig.endpoint);
      setApiKey(currentConfig.apiKey);
      setModel(currentConfig.model);
    } else {
      setProviderId('openai');
      setEndpoint(PROVIDER_DEFAULTS.openai.endpoint);
      setApiKey('');
      setModel(PROVIDER_DEFAULTS.openai.models[0]);
    }
  }, [currentConfig]);

  // Update endpoint when provider changes
  const handleProviderChange = (newProviderId: ProviderId) => {
    setProviderId(newProviderId);
    const defaults = PROVIDER_DEFAULTS[newProviderId];
    setEndpoint(defaults.endpoint);
    if (defaults.models.length > 0) {
      setModel(defaults.models[0]);
    } else {
      setModel('');
    }
    setSuccess(false);
  };

  const handleSave = async () => {
    // Validation
    if (!endpoint.trim()) {
      setError('Endpoint is required');
      return;
    }
    if (!apiKey.trim()) {
      setError('API Key is required');
      return;
    }
    if (!model.trim()) {
      setError('Model is required');
      return;
    }

    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      await onSave({
        providerId,
        endpoint: endpoint.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const providerModels = PROVIDER_DEFAULTS[providerId].models;
  const isConfigured = currentConfig !== null;

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" color="text.secondary">
          LLM Configuration
        </Typography>
        {isConfigured && (
          <Chip
            icon={<Check fontSize="small" />}
            label="Configured"
            size="small"
            color="success"
            variant="outlined"
          />
        )}
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success">Configuration saved!</Alert>}

      <FormControl fullWidth size="small" sx={inputStyle}>
        <InputLabel>Provider</InputLabel>
        <Select
          value={providerId}
          label="Provider"
          onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
        >
          <MenuItem value="openai">OpenAI</MenuItem>
          <MenuItem value="anthropic">Anthropic</MenuItem>
          <MenuItem value="custom">Custom (OpenAI-compatible)</MenuItem>
        </Select>
      </FormControl>

      <TextField
        label="API Endpoint"
        value={endpoint}
        onChange={(e) => { setEndpoint(e.target.value); setSuccess(false); }}
        fullWidth
        size="small"
        placeholder="https://api.openai.com/v1/chat/completions"
        helperText={providerId === 'custom' ? 'Must be OpenAI-compatible API' : undefined}
        sx={inputStyle}
      />

      <TextField
        label="API Key"
        type={showApiKey ? 'text' : 'password'}
        value={apiKey}
        onChange={(e) => { setApiKey(e.target.value); setSuccess(false); }}
        fullWidth
        size="small"
        sx={inputStyle}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => setShowApiKey(!showApiKey)}
                edge="end"
                size="small"
              >
                {showApiKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />

      {providerModels.length > 0 ? (
        <FormControl fullWidth size="small" sx={inputStyle}>
          <InputLabel>Model</InputLabel>
          <Select
            value={model}
            label="Model"
            onChange={(e) => { setModel(e.target.value); setSuccess(false); }}
          >
            {providerModels.map((m) => (
              <MenuItem key={m} value={m}>
                {m}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : (
        <TextField
          label="Model"
          value={model}
          onChange={(e) => { setModel(e.target.value); setSuccess(false); }}
          fullWidth
          size="small"
          placeholder="e.g., gpt-4o"
          sx={inputStyle}
        />
      )}

      <Button
        onClick={handleSave}
        variant="contained"
        disabled={saving}
        fullWidth
      >
        {saving ? 'Saving...' : 'Save Configuration'}
      </Button>
    </Box>
  );
}

export interface LlmConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: Omit<LlmConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  currentConfig: LlmConfig | null;
}

/**
 * LLM Config Dialog - Dialog wrapper for LlmConfigPanel (for backward compatibility)
 */
export function LlmConfigDialog({ open, onClose, onSave, currentConfig }: LlmConfigDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [providerId, setProviderId] = useState<ProviderId>('openai');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialize from current config
  useEffect(() => {
    if (currentConfig) {
      setProviderId(currentConfig.providerId);
      setEndpoint(currentConfig.endpoint);
      setApiKey(currentConfig.apiKey);
      setModel(currentConfig.model);
    } else {
      setProviderId('openai');
      setEndpoint(PROVIDER_DEFAULTS.openai.endpoint);
      setApiKey('');
      setModel(PROVIDER_DEFAULTS.openai.models[0]);
    }
  }, [currentConfig, open]);

  // Update endpoint when provider changes
  const handleProviderChange = (newProviderId: ProviderId) => {
    setProviderId(newProviderId);
    const defaults = PROVIDER_DEFAULTS[newProviderId];
    setEndpoint(defaults.endpoint);
    if (defaults.models.length > 0) {
      setModel(defaults.models[0]);
    } else {
      setModel('');
    }
  };

  const handleSave = async () => {
    // Validation
    if (!endpoint.trim()) {
      setError('Endpoint is required');
      return;
    }
    if (!apiKey.trim()) {
      setError('API Key is required');
      return;
    }
    if (!model.trim()) {
      setError('Model is required');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await onSave({
        providerId,
        endpoint: endpoint.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const providerModels = PROVIDER_DEFAULTS[providerId].models;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>LLM Configuration</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <FormControl fullWidth sx={inputStyle}>
            <InputLabel>Provider</InputLabel>
            <Select
              value={providerId}
              label="Provider"
              onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
            >
              <MenuItem value="openai">OpenAI</MenuItem>
              <MenuItem value="anthropic">Anthropic</MenuItem>
              <MenuItem value="custom">Custom (OpenAI-compatible)</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="API Endpoint"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            fullWidth
            placeholder="https://api.openai.com/v1/chat/completions"
            helperText={providerId === 'custom' ? 'Must be OpenAI-compatible API' : undefined}
            sx={inputStyle}
          />

          <TextField
            label="API Key"
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            fullWidth
            sx={inputStyle}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowApiKey(!showApiKey)}
                    edge="end"
                  >
                    {showApiKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {providerModels.length > 0 ? (
            <FormControl fullWidth sx={inputStyle}>
              <InputLabel>Model</InputLabel>
              <Select
                value={model}
                label="Model"
                onChange={(e) => setModel(e.target.value)}
              >
                {providerModels.map((m) => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <TextField
              label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              fullWidth
              placeholder="e.g., gpt-4o"
              sx={inputStyle}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
