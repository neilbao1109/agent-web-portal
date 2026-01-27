import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Lock as LockIcon,
  CheckCircle as CheckCircleIcon,
  Devices as DevicesIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

interface PendingAuthInfo {
  clientName: string;
  verificationCode: string;
}

export default function AuthorizePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const pubkey = searchParams.get('pubkey') || '';

  const [pendingAuth, setPendingAuth] = useState<PendingAuthInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expiresIn, setExpiresIn] = useState('2592000'); // 30 days default

  // Fetch pending auth info
  useEffect(() => {
    if (!pubkey) {
      setError('Missing pubkey parameter');
      setLoading(false);
      return;
    }

    async function fetchPendingAuth() {
      try {
        // We need to get the pending auth info
        // For now, we'll use the auth/status endpoint
        const response = await fetch(`/auth/status?pubkey=${encodeURIComponent(pubkey)}`);
        const data = await response.json();

        if (data.authorized) {
          // Already authorized
          setError('This client is already authorized');
          setLoading(false);
          return;
        }

        // Since we don't have a direct API to get pending auth info,
        // we'll rely on the server-rendered page or add a new endpoint
        // For now, we'll just show a form and let the user enter the code
        setPendingAuth({
          clientName: 'MCP Client', // Will be updated when we have the API
          verificationCode: '', // User will enter this
        });
        setLoading(false);
      } catch {
        setError('Failed to load authorization request');
        setLoading(false);
      }
    }

    fetchPendingAuth();
  }, [pubkey]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user && pubkey) {
      const returnUrl = encodeURIComponent(`/auth/page?pubkey=${encodeURIComponent(pubkey)}`);
      navigate(`/login?returnUrl=${returnUrl}`, { replace: true });
    }
  }, [user, authLoading, navigate, pubkey]);

  const handleAuthorize = async () => {
    if (!pendingAuth?.verificationCode) {
      setError('Please enter the verification code');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/auth/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey,
          verification_code: pendingAuth.verificationCode,
          expires_in: expiresIn ? parseInt(expiresIn, 10) : undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuccess(true);

        // Notify opener window via postMessage if available
        if (window.opener && document.referrer) {
          try {
            const referrerOrigin = new URL(document.referrer).origin;
            window.opener.postMessage(
              {
                type: 'awp-auth-complete',
                pubkey,
                expiresAt: data.expires_at,
              },
              referrerOrigin
            );
          } catch {
            // Ignore postMessage errors (e.g., cross-origin issues)
          }
        }
      } else {
        const data = await response.json();
        setError(data.error_description || 'Authorization failed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeny = () => {
    window.close();
    // If window.close doesn't work, redirect to home
    setTimeout(() => navigate('/'), 100);
  };

  if (authLoading || loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <CircularProgress sx={{ color: 'white' }} />
      </Box>
    );
  }

  if (success) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
          p: 2,
        }}
      >
        <Card sx={{ maxWidth: 400, width: '100%', textAlign: 'center', p: 4 }}>
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
            }}
          >
            <CheckCircleIcon sx={{ fontSize: 40, color: 'white' }} />
          </Box>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Authorization Complete!
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            The client has been authorized. You can close this window and return to your application.
          </Typography>
          <Button variant="outlined" onClick={() => navigate('/clients')}>
            Manage Clients
          </Button>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 450, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <LockIcon sx={{ fontSize: 32, color: 'white' }} />
            </Box>
            <Typography variant="h5" fontWeight={600}>
              Authorize Application
            </Typography>
            <Typography variant="body2" color="text.secondary">
              A client is requesting access to your account
            </Typography>
          </Box>

          {/* Client Info */}
          <Box
            sx={{
              p: 2,
              mb: 3,
              borderRadius: 2,
              bgcolor: 'grey.50',
              border: '1px solid',
              borderColor: 'grey.200',
              textAlign: 'center',
            }}
          >
            <DevicesIcon sx={{ color: 'text.secondary', mb: 1 }} />
            <Typography variant="caption" color="text.secondary" display="block">
              Client Name
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {pendingAuth?.clientName || 'MCP Client'}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Verification Code Input */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Enter the verification code shown in your client:
            </Typography>
            <Box
              component="input"
              sx={{
                width: '100%',
                p: 2,
                fontSize: '1.5rem',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                textAlign: 'center',
                letterSpacing: 4,
                border: '2px dashed',
                borderColor: 'primary.main',
                borderRadius: 2,
                bgcolor: 'primary.light',
                outline: 'none',
                '&:focus': {
                  borderStyle: 'solid',
                },
              }}
              placeholder="XXX-XXX"
              value={pendingAuth?.verificationCode || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setPendingAuth((prev) => ({
                  ...prev!,
                  verificationCode: e.target.value.toUpperCase(),
                }))
              }
              maxLength={7}
            />
          </Box>

          {/* Expiration Selection */}
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Authorization Duration</InputLabel>
            <Select
              value={expiresIn}
              label="Authorization Duration"
              onChange={(e) => setExpiresIn(e.target.value)}
            >
              <MenuItem value="86400">1 day</MenuItem>
              <MenuItem value="604800">7 days</MenuItem>
              <MenuItem value="2592000">30 days</MenuItem>
              <MenuItem value="7776000">90 days</MenuItem>
              <MenuItem value="">Never expires</MenuItem>
            </Select>
          </FormControl>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              onClick={handleDeny}
              disabled={submitting}
            >
              Deny
            </Button>
            <Button
              fullWidth
              variant="contained"
              onClick={handleAuthorize}
              disabled={submitting || !pendingAuth?.verificationCode}
              sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              }}
            >
              {submitting ? <CircularProgress size={24} color="inherit" /> : 'Authorize'}
            </Button>
          </Box>

          {/* Warning */}
          <Alert severity="warning" sx={{ mt: 3 }}>
            Only authorize applications you trust. This client will be able to access tools on your
            behalf.
          </Alert>
        </CardContent>
      </Card>
    </Box>
  );
}
