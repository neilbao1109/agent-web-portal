/**
 * CAS Configuration Manager
 *
 * Component for configuring CAS server and handling AWP client authorization.
 * Uses P256 ECDSA keypairs, same as AWP auth flow.
 * 
 * Flow:
 * 1. Generate P256 keypair locally
 * 2. POST /api/auth/agent-tokens/init - Get auth_url and verification_code
 * 3. Open auth_url in popup window
 * 4. User logs in and approves the client
 * 5. Poll /api/auth/agent-tokens/status until authorized
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Paper,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Collapse,
  Link,
} from '@mui/material';
import {
  Storage as StorageIcon,
  Check as CheckIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { AwpAuth, pollAuthStatus, generateKeyPair } from '@agent-web-portal/client';
import { startBrowserAuthFlow } from '@agent-web-portal/client-browser';
import type { KeyStorage } from '@agent-web-portal/client';

interface CasConfigManagerProps {
  casEndpoint: string;
  onCasEndpointChange: (endpoint: string) => void;
  keyStorage: KeyStorage;
  clientName: string;
  onAuthStatusChange?: (isAuthenticated: boolean) => void;
}

type AuthState = 'unknown' | 'checking' | 'authenticated' | 'unauthenticated' | 'authorizing' | 'error';

interface AuthInitResponse {
  auth_url: string;
  verification_code: string;
  expires_in: number;
  poll_interval: number;
}

export function CasConfigManager({
  casEndpoint,
  onCasEndpointChange,
  keyStorage,
  clientName,
  onAuthStatusChange,
}: CasConfigManagerProps) {
  const [endpoint, setEndpoint] = useState(casEndpoint);
  const [authState, setAuthState] = useState<AuthState>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [authChallenge, setAuthChallenge] = useState<{
    authUrl: string;
    verificationCode: string;
    publicKey: string;
    pollInterval: number;
    expiresIn: number;
  } | null>(null);
  const [expanded, setExpanded] = useState(true);
  
  // Cleanup function for auth flow
  const authCleanupRef = useRef<(() => void) | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  
  // Use refs for callbacks to avoid dependency issues
  const onAuthStatusChangeRef = useRef(onAuthStatusChange);
  onAuthStatusChangeRef.current = onAuthStatusChange;

  // Sync endpoint state with prop and reset auth state
  useEffect(() => {
    setEndpoint(casEndpoint);
    // Reset auth state when endpoint changes
    setAuthState('unknown');
    setAuthChallenge(null);
    setError(null);
    // Cleanup any ongoing auth flow
    authCleanupRef.current?.();
    pollAbortRef.current?.abort();
    authCleanupRef.current = null;
    pollAbortRef.current = null;
  }, [casEndpoint]);

  // Create auth instance (memoized to prevent infinite loops)
  const auth = useMemo(() => new AwpAuth({
    clientName,
    keyStorage,
  }), [clientName, keyStorage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      authCleanupRef.current?.();
      pollAbortRef.current?.abort();
    };
  }, []);

  // Check auth status
  const checkAuthStatus = useCallback(async () => {
    if (!endpoint) {
      setAuthState('unknown');
      return;
    }

    setAuthState('checking');
    setError(null);

    try {
      const hasKey = await auth.hasValidKey(endpoint);
      if (hasKey) {
        // Verify the key is still valid by checking status endpoint
        const storedData = await keyStorage.load(endpoint);
        if (storedData) {
          const statusUrl = `${endpoint}/auth/agent-tokens/status?pubkey=${encodeURIComponent(storedData.keyPair.publicKey)}`;
          const response = await fetch(statusUrl);
          if (response.ok) {
            const data = await response.json() as { authorized: boolean };
            if (data.authorized) {
              setAuthState('authenticated');
              onAuthStatusChangeRef.current?.(true);
              return;
            }
          }
        }
        // Key exists but not authorized on server
        setAuthState('unauthenticated');
        onAuthStatusChangeRef.current?.(false);
      } else {
        setAuthState('unauthenticated');
        onAuthStatusChangeRef.current?.(false);
      }
    } catch (err) {
      console.error('Failed to check CAS auth status:', err);
      setAuthState('error');
      setError(err instanceof Error ? err.message : 'Failed to connect to CAS server');
      onAuthStatusChangeRef.current?.(false);
    }
  }, [endpoint, auth, keyStorage]);

  // Check auth status on mount and when endpoint changes
  useEffect(() => {
    if (endpoint) {
      checkAuthStatus();
    }
  }, [endpoint]); // Only depend on endpoint, not checkAuthStatus

  // Handle endpoint save
  const handleSaveEndpoint = () => {
    if (!endpoint.trim()) {
      setError('CAS endpoint URL is required');
      return;
    }

    try {
      new URL(endpoint);
    } catch {
      setError('Invalid URL format');
      return;
    }

    onCasEndpointChange(endpoint.trim());
    checkAuthStatus();
  };

  // Handle auth success
  const handleAuthSuccess = useCallback(() => {
    setAuthState('authenticated');
    setAuthChallenge(null);
    authCleanupRef.current = null;
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    onAuthStatusChangeRef.current?.(true);
  }, []);

  // Handle auth cancelled/failed
  const handleAuthCancelled = useCallback(() => {
    setAuthState('unauthenticated');
    setAuthChallenge(null);
    authCleanupRef.current = null;
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
  }, []);

  // Start authorization flow
  const handleStartAuth = async () => {
    if (!endpoint) {
      setError('Please configure CAS endpoint first');
      return;
    }

    // Cleanup any previous auth flow
    authCleanupRef.current?.();
    pollAbortRef.current?.abort();

    setAuthState('authorizing');
    setError(null);

    try {
      // Generate new P256 keypair
      const keyPair = await generateKeyPair();

      // Call /api/auth/agent-tokens/init to start auth flow
      const initUrl = `${endpoint}/auth/agent-tokens/init`;
      const initResponse = await fetch(initUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: keyPair.publicKey,
          client_name: clientName,
        }),
      });

      if (!initResponse.ok) {
        const errorData = await initResponse.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `Auth init failed: ${initResponse.status}`);
      }

      const initData = await initResponse.json() as AuthInitResponse;

      // Save keypair to storage
      await keyStorage.save(endpoint, {
        keyPair,
        endpoint,
        clientName,
      });

      // Build auth URL using the configured endpoint (not the server-returned one)
      // Server returns auth_url based on its own origin, but we want to use user's configured endpoint
      const endpointUrl = new URL(endpoint);
      const authUrl = `${endpointUrl.origin}/auth/awp?pubkey=${encodeURIComponent(keyPair.publicKey)}`;

      // Set challenge info for UI
      setAuthChallenge({
        authUrl,
        verificationCode: initData.verification_code,
        publicKey: keyPair.publicKey,
        pollInterval: initData.poll_interval,
        expiresIn: initData.expires_in,
      });

      // Start browser auth flow - opens popup and listens for postMessage
      const { cleanup } = startBrowserAuthFlow({
        authUrl,
        pubkey: keyPair.publicKey,
        onAuthorized: handleAuthSuccess,
        onCancelled: () => {
          // User closed popup, but keep polling in case they complete auth in another tab
          console.log('Auth popup closed, continuing to poll...');
        },
      });
      authCleanupRef.current = cleanup;

      // Also poll as fallback (in case postMessage doesn't work)
      // Use longer interval to reduce server load (minimum 10 seconds)
      const statusUrl = `${endpoint}/auth/agent-tokens/status?pubkey=${encodeURIComponent(keyPair.publicKey)}`;
      const abortController = new AbortController();
      pollAbortRef.current = abortController;
      
      const pollInterval = Math.max(initData.poll_interval * 1000, 10000); // At least 10 seconds
      
      pollAuthStatus(statusUrl, {
        interval: pollInterval,
        timeout: initData.expires_in * 1000,
        signal: abortController.signal,
      }).then((result) => {
        if (result.authorized) {
          handleAuthSuccess();
        } else if (!abortController.signal.aborted) {
          setAuthState('unauthenticated');
          setAuthChallenge(null);
          setError('Authorization timed out. Please try again.');
        }
      });

    } catch (err) {
      console.error('Failed to start CAS auth:', err);
      setAuthState('error');
      setError(err instanceof Error ? err.message : 'Failed to start authorization');
    }
  };

  // Clear auth
  const handleClearAuth = async () => {
    try {
      await auth.clearKey(endpoint);
      setAuthState('unauthenticated');
      onAuthStatusChangeRef.current?.(false);
    } catch (err) {
      console.error('Failed to clear auth:', err);
    }
  };

  // Cancel auth flow
  const handleCancelAuth = () => {
    authCleanupRef.current?.();
    pollAbortRef.current?.abort();
    handleAuthCancelled();
  };

  // Get CAS WebUI URL from endpoint
  const getCasWebUiUrl = () => {
    try {
      const url = new URL(endpoint);
      // Assume cas-webui runs on port 3551 if api is on 3550
      if (url.port === '3550') {
        url.port = '3551';
      }
      // Remove /api suffix if present
      url.pathname = '/';
      return url.toString();
    } catch {
      return null;
    }
  };

  const getStatusChip = () => {
    switch (authState) {
      case 'checking':
        return <Chip icon={<CircularProgress size={14} />} label="Checking..." size="small" />;
      case 'authenticated':
        return <Chip icon={<CheckIcon />} label="Authorized" size="small" color="success" />;
      case 'unauthenticated':
        return <Chip icon={<ErrorIcon />} label="Not Authorized" size="small" color="warning" />;
      case 'authorizing':
        return <Chip icon={<CircularProgress size={14} />} label="Authorizing..." size="small" color="info" />;
      case 'error':
        return <Chip icon={<ErrorIcon />} label="Error" size="small" color="error" />;
      default:
        return <Chip label="Not Configured" size="small" />;
    }
  };

  const casWebUiUrl = getCasWebUiUrl();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StorageIcon color="primary" />
          <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            CAS Configuration
          </Typography>
          {getStatusChip()}
        </Box>
        <IconButton onClick={() => setExpanded(!expanded)} size="small">
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="CAS Server URL"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              fullWidth
              placeholder="http://localhost:3550/api"
              helperText="The Content-Addressable Storage server API endpoint"
              size="small"
            />

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleSaveEndpoint}
                disabled={endpoint === casEndpoint}
              >
                Save Endpoint
              </Button>
              <IconButton
                onClick={checkAuthStatus}
                title="Refresh status"
                size="small"
                disabled={authState === 'checking'}
              >
                <RefreshIcon />
              </IconButton>
            </Box>

            <Divider />

            {authState === 'authenticated' ? (
              <Box>
                <Alert severity="success" sx={{ mb: 2 }}>
                  You are authorized to use this CAS server.
                </Alert>
                <Button
                  variant="outlined"
                  color="warning"
                  size="small"
                  onClick={handleClearAuth}
                >
                  Clear Authorization
                </Button>
              </Box>
            ) : authState === 'authorizing' && authChallenge ? (
              <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    A popup window should have opened for authorization.
                  </Typography>
                  <Typography variant="body2" gutterBottom>
                    Log in and enter this verification code:
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    <code style={{ 
                      backgroundColor: '#e3f2fd', 
                      padding: '4px 12px', 
                      borderRadius: '4px',
                      fontSize: '1.2em',
                      fontWeight: 'bold',
                      letterSpacing: '0.1em',
                    }}>
                      {authChallenge.verificationCode}
                    </code>
                  </Typography>
                </Alert>
                
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open(authChallenge.authUrl, 'cas-auth', 'width=600,height=700')}
                  >
                    Reopen Auth Window
                  </Button>
                  {casWebUiUrl && (
                    <Button
                      variant="text"
                      size="small"
                      startIcon={<OpenInNewIcon />}
                      onClick={() => window.open(casWebUiUrl, '_blank')}
                    >
                      Open CAS WebUI
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={handleCancelAuth}
                  >
                    Cancel
                  </Button>
                </Box>
                
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Waiting for authorization... (expires in {Math.floor(authChallenge.expiresIn / 60)} minutes)
                </Typography>
              </Box>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Authorize with CAS to enable blob support for AWP endpoints.
                  A popup will open for you to log in and approve this client.
                </Typography>
                
                {casWebUiUrl && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    CAS WebUI:{' '}
                    <Link href={casWebUiUrl} target="_blank" rel="noopener">
                      {casWebUiUrl}
                    </Link>
                  </Typography>
                )}
                
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleStartAuth}
                  disabled={!endpoint || authState === 'checking' || authState === 'authorizing'}
                >
                  Authorize with CAS
                </Button>
              </Box>
            )}
          </Box>
        </Paper>
      </Collapse>
    </Box>
  );
}
