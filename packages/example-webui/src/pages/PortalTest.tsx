import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Logout as LogoutIcon,
  CloudUpload as UploadIcon,
  Image as ImageIcon,
  Download as DownloadIcon,
  AutoAwesome as SkillIcon,
} from '@mui/icons-material';

interface AwpExtension {
  /** Simple blob field lists - just the parameter names */
  blob?: {
    /** Input blob parameter names */
    input?: string[];
    /** Output blob parameter names */
    output?: string[];
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  _awp?: AwpExtension;
}

interface Skill {
  url: string;
  frontmatter: {
    name?: string;
    description?: string;
    version?: string;
    'allowed-tools'?: string[];
    [key: string]: unknown;
  };
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface AuthState {
  status: 'none' | 'pending' | 'polling' | 'authenticated' | 'failed';
  verificationCode?: string;
  authPageUrl?: string;
  pubkey?: string;
  error?: string;
}

// API base URL - uses VITE_API_URL in production, empty string for local dev (proxy)
const API_BASE = import.meta.env.VITE_API_URL || '';

const PORTAL_ENDPOINTS: Record<string, string> = {
  basic: `${API_BASE}/api/awp/basic`,
  ecommerce: `${API_BASE}/api/awp/ecommerce`,
  jsonata: `${API_BASE}/api/awp/jsonata`,
  secure: `${API_BASE}/api/awp/secure`,
  blob: `${API_BASE}/api/awp/blob`,
  'image-workshop': `${API_BASE}/api/awp/image-workshop`,
};

// Image Preview Component for output blobs
function ImagePreview({
  response,
  getOutputBlobFields,
  outputBlobUrls,
}: {
  response: JsonRpcResponse | null;
  getOutputBlobFields: () => string[];
  outputBlobUrls: Record<string, string>;
}) {
  if (!response?.result || getOutputBlobFields().length === 0) {
    return null;
  }

  try {
    const content = (response.result as { content?: Array<{ text?: string }> })?.content?.[0]?.text;
    if (!content) return null;

    const data = JSON.parse(content) as Record<string, unknown>;
    const outputBlobs = getOutputBlobFields();

    // Get images from output blob URLs (written by the tool)
    const imagesToShow = outputBlobs
      .filter((field) => outputBlobUrls[field])
      .map((field) => ({
        field,
        url: outputBlobUrls[field],
        contentType: data.contentType as string | undefined,
      }));

    // Also check for images stored in permanent storage (key starts with images/)
    const permanentImages = outputBlobs
      .filter(
        (field) =>
          data[field] && typeof data[field] === 'string' && (data[field] as string).startsWith('images/')
      )
      .map((field) => ({
        field,
        url: `/blob/files/${encodeURIComponent(data[field] as string)}`,
        contentType: data.contentType as string | undefined,
      }));

    const allImages = [...imagesToShow, ...permanentImages.filter(
      (p) => !imagesToShow.some((i) => i.field === p.field)
    )];

    if (allImages.length === 0) return null;

    return (
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ImageIcon fontSize="small" />
          Output Images
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          {allImages.map(({ field, url }) => (
            <Box key={field} sx={{ textAlign: 'center' }}>
              <Box
                component="img"
                src={url}
                alt={field}
                sx={{
                  maxWidth: 200,
                  maxHeight: 150,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <Typography variant="caption" display="block">
                {field}
              </Typography>
              <Button
                size="small"
                startIcon={<DownloadIcon />}
                href={url}
                target="_blank"
              >
                Download
              </Button>
            </Box>
          ))}
        </Stack>
      </Box>
    );
  } catch {
    return null;
  }
}

// Simple base64url encoding
function base64urlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// =============================================================================
// IndexedDB Key Storage
// =============================================================================

const DB_NAME = 'awp-auth-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keypairs';

interface StoredKeyData {
  endpoint: string;
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  pubkeyB64: string;
  expiresAt: number; // Unix timestamp in ms
  createdAt: number;
}

async function openKeyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'endpoint' });
      }
    };
  });
}

async function saveKeyPair(
  endpoint: string,
  keyPair: CryptoKeyPair,
  pubkeyB64: string,
  expiresAt: number
): Promise<void> {
  const db = await openKeyDB();
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

  const data: StoredKeyData = {
    endpoint,
    privateKeyJwk,
    publicKeyJwk,
    pubkeyB64,
    expiresAt,
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(data);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

async function loadKeyPair(
  endpoint: string
): Promise<{ keyPair: CryptoKeyPair; pubkeyB64: string; expiresAt: number } | null> {
  try {
    const db = await openKeyDB();

    const data = await new Promise<StoredKeyData | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(endpoint);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      tx.oncomplete = () => db.close();
    });

    if (!data) {
      return null;
    }

    // Check if expired
    if (Date.now() > data.expiresAt) {
      await deleteKeyPair(endpoint);
      return null;
    }

    // Import keys back from JWK
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      data.privateKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      data.publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );

    return {
      keyPair: { privateKey, publicKey },
      pubkeyB64: data.pubkeyB64,
      expiresAt: data.expiresAt,
    };
  } catch {
    return null;
  }
}

async function deleteKeyPair(endpoint: string): Promise<void> {
  try {
    const db = await openKeyDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(endpoint);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Ignore errors on delete
  }
}

export default function PortalTest() {
  const { portalId } = useParams<{ portalId: string }>();
  const endpoint = PORTAL_ENDPOINTS[portalId ?? ''] ?? '/api/awp/basic';
  const isAuthPortal = portalId === 'secure';

  const [tools, setTools] = useState<Tool[]>([]);
  const [skills, setSkills] = useState<Record<string, Skill>>({});
  const [selectedTool, setSelectedTool] = useState('');
  const [arguments_, setArguments] = useState('{}');
  const [response, setResponse] = useState<JsonRpcResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Blob upload state
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, { key: string; file: File }>>({});
  const [uploading, setUploading] = useState(false);
  // Output blob URLs for displaying results
  const [outputBlobUrls, setOutputBlobUrls] = useState<Record<string, string>>({});

  // Auth state
  const [authState, setAuthState] = useState<AuthState>({ status: 'none' });
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authExpiresAt, setAuthExpiresAt] = useState<number | null>(null);
  const keyPairRef = useRef<CryptoKeyPair | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Check for stored key on mount or endpoint change
  useEffect(() => {
    const checkStoredKey = async () => {
      if (!isAuthPortal) {
        return { isAuthenticated: false };
      }

      const stored = await loadKeyPair(endpoint);
      if (stored) {
        keyPairRef.current = stored.keyPair;
        setAuthState({
          status: 'authenticated',
          pubkey: stored.pubkeyB64,
        });
        setAuthExpiresAt(stored.expiresAt);
        return { isAuthenticated: true };
      } else {
        setAuthState({ status: 'none' });
        keyPairRef.current = null;
        return { isAuthenticated: false };
      }
    };

    checkStoredKey().then(({ isAuthenticated }) => {
      // Load tools immediately with the correct auth status
      // This avoids race condition where authState hasn't updated yet
      loadTools(isAuthenticated);
    });

    // Clear polling on endpoint change
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
  }, [endpoint, isAuthPortal]);

  // Generate Ed25519-like key pair (using ECDSA P-256 for browser compatibility)
  const generateKeyPair = async (): Promise<{ pubkeyB64: string; keyPair: CryptoKeyPair }> => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    keyPairRef.current = keyPair;

    // Export public key in JWK format to get x and y coordinates
    const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    // Format: x.y (both base64url encoded)
    const pubkeyB64 = `${jwk.x}.${jwk.y}`;

    return { pubkeyB64, keyPair };
  };

  // Hash body using SHA-256
  const hashBody = async (body: string): Promise<string> => {
    const bodyBytes = new TextEncoder().encode(body);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bodyBytes);
    return base64urlEncode(new Uint8Array(hashBuffer));
  };

  // Sign a request
  // Payload format: timestamp.METHOD.path.bodyHash
  const signRequest = async (
    method: string,
    url: string,
    body: string
  ): Promise<Record<string, string>> => {
    if (!keyPairRef.current) {
      throw new Error('No key pair available');
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Export public key in JWK format to get x.y format
    const jwk = await crypto.subtle.exportKey('jwk', keyPairRef.current.publicKey);
    const pubkeyB64 = `${jwk.x}.${jwk.y}`;

    // Get path from URL
    const urlObj = new URL(url, window.location.origin);
    const path = urlObj.pathname;

    // Hash the body
    const bodyHash = await hashBody(body);

    // Create signature payload: timestamp.METHOD.path.bodyHash
    const payload = `${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`;
    const payloadBytes = new TextEncoder().encode(payload);

    // Sign
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPairRef.current.privateKey,
      payloadBytes
    );
    const signatureB64 = base64urlEncode(new Uint8Array(signature));

    return {
      'X-AWP-Pubkey': pubkeyB64,
      'X-AWP-Timestamp': timestamp,
      'X-AWP-Signature': signatureB64,
    };
  };

  // JSON-RPC request with optional signing
  const jsonRpc = async (
    method: string,
    params?: unknown,
    signed = false
  ): Promise<{ response: Response; data: JsonRpcResponse }> => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    });

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (signed && keyPairRef.current) {
      const authHeaders = await signRequest('POST', endpoint, body);
      headers = { ...headers, ...authHeaders };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    });

    const data = await res.json();
    return { response: res, data };
  };

  // Handle 401 response - start auth flow
  const handleUnauthorized = async (responseBody: {
    auth_init_endpoint?: string;
    error_description?: string;
  }) => {
    if (!responseBody.auth_init_endpoint) {
      setError('Server did not provide auth endpoint');
      return;
    }

    setAuthState({ status: 'pending' });

    try {
      // Generate key pair
      const { pubkeyB64 } = await generateKeyPair();

      // Call auth/init - prepend API_BASE if it's a relative path
      const authInitUrl = responseBody.auth_init_endpoint.startsWith('/')
        ? `${API_BASE}${responseBody.auth_init_endpoint}`
        : responseBody.auth_init_endpoint;
      const initRes = await fetch(authInitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: pubkeyB64,
          client_name: 'AWP UI Test',
        }),
      });

      if (!initRes.ok) {
        throw new Error(`Auth init failed: ${initRes.status}`);
      }

      const initData = await initRes.json();
      const verificationCode = initData.verification_code;
      const authPageUrl = initData.auth_url;

      setAuthState({
        status: 'pending',
        verificationCode,
        authPageUrl,
        pubkey: pubkeyB64,
      });
      setAuthDialogOpen(true);
    } catch (err) {
      setAuthState({
        status: 'failed',
        error: err instanceof Error ? err.message : 'Auth initialization failed',
      });
    }
  };

  // Track if we need to reload after auth
  const [needsReload, setNeedsReload] = useState(false);

  // Start polling auth status
  const startPolling = (pubkey: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    setAuthState((prev) => ({ ...prev, status: 'polling' }));

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/status?pubkey=${encodeURIComponent(pubkey)}`);
        const data = await res.json();

        // Check if authorized (response is { authorized: true/false, expires_at?: number })
        if (data.authorized === true) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          // Save key pair to IndexedDB with expiration
          const expiresAt = data.expires_at ?? Date.now() + 24 * 60 * 60 * 1000; // Default 24h
          if (keyPairRef.current) {
            await saveKeyPair(endpoint, keyPairRef.current, pubkey, expiresAt);
          }

          setAuthExpiresAt(expiresAt);
          setAuthState((prev) => ({ ...prev, status: 'authenticated' }));
          setAuthDialogOpen(false);
          // Trigger reload
          setNeedsReload(true);
        } else if (data.error) {
          // Authorization expired or not found
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setAuthState((prev) => ({
            ...prev,
            status: 'failed',
            error: data.error,
          }));
        }
        // If authorized === false and no error, keep polling
      } catch {
        // Continue polling on network errors
      }
    };

    // Poll immediately and then every 2 seconds
    poll();
    pollingRef.current = setInterval(poll, 2000);
  };

  // Open auth page in new window
  const openAuthPage = () => {
    if (authState.authPageUrl && authState.verificationCode && authState.pubkey) {
      // auth_url already contains pubkey, we just need to add the verification code
      const url = new URL(authState.authPageUrl);
      url.searchParams.set('code', authState.verificationCode);
      window.open(url.toString(), '_blank', 'width=500,height=600');
      startPolling(authState.pubkey);
    }
  };

  // Logout - clear auth state and keypair, reload without auth
  const handleLogout = async () => {
    // Clear polling if any
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    // Delete stored key pair from IndexedDB
    await deleteKeyPair(endpoint);

    // Clear key pair
    keyPairRef.current = null;

    // Reset auth state
    setAuthState({ status: 'none' });
    setAuthExpiresAt(null);

    // Clear tools and initialized state
    setTools([]);
    setSelectedTool('');
    setInitialized(false);
    setResponse(null);

    // Try to load tools again (will trigger 401 for auth portal)
    loadTools(false);
  };

  const loadTools = async (signed = false) => {
    setLoading(true);
    setError('');
    try {
      // Initialize first
      const initResult = await jsonRpc(
        'initialize',
        {
          protocolVersion: '2025-01-01',
          capabilities: {},
          clientInfo: { name: 'AWP UI', version: '1.0.0' },
        },
        signed && isAuthPortal
      );

      // Check for 401
      if (initResult.response.status === 401) {
        const body = initResult.data as unknown as {
          auth_init_endpoint?: string;
          error_description?: string;
        };
        await handleUnauthorized(body);
        setLoading(false);
        return;
      }

      setInitialized(true);

      // Then get tools
      const toolsRes = await jsonRpc('tools/list', undefined, signed && isAuthPortal);

      if (toolsRes.response.status === 401) {
        const body = toolsRes.data as unknown as {
          auth_init_endpoint?: string;
          error_description?: string;
        };
        await handleUnauthorized(body);
        setLoading(false);
        return;
      }

      if (
        toolsRes.data.result &&
        typeof toolsRes.data.result === 'object' &&
        'tools' in toolsRes.data.result
      ) {
        const toolsList = (toolsRes.data.result as { tools: Tool[] }).tools;
        setTools(toolsList);
        if (toolsList.length > 0) {
          setSelectedTool(toolsList[0].name);
          updateDefaultArgs(toolsList[0]);
        }
      }

      // Get skills (AWP extension)
      try {
        const skillsRes = await jsonRpc('skills/list', undefined, signed && isAuthPortal);
        if (
          skillsRes.data.result &&
          typeof skillsRes.data.result === 'object'
        ) {
          setSkills(skillsRes.data.result as Record<string, Skill>);
        }
      } catch {
        // Skills are optional, ignore errors
        setSkills({});
      }
    } catch (err) {
      setError('Failed to load tools');
    } finally {
      setLoading(false);
    }
  };

  // Note: loadTools is now called directly in checkStoredKey to avoid race conditions
  // with authState updates. The old useEffect was removed.

  // Reload tools after successful authentication
  useEffect(() => {
    if (needsReload) {
      setNeedsReload(false);
      loadTools(true);
    }
  }, [needsReload]);

  // Default example values for specific tools
  const TOOL_EXAMPLES: Record<string, Record<string, unknown>> = {
    jsonata_eval: {
      expression: '$sum(items.price)',
      input: {
        items: [
          { name: 'Apple', price: 1.5 },
          { name: 'Banana', price: 0.8 },
          { name: 'Orange', price: 2.0 },
        ],
      },
    },
    greet: {
      name: 'World',
    },
    search_products: {
      query: 'phone',
      category: 'electronics',
      limit: 10,
    },
    get_product: {
      productId: 'prod-001',
    },
    get_user_info: {},
  };

  const updateDefaultArgs = (tool: Tool) => {
    // Check if we have a predefined example for this tool
    if (TOOL_EXAMPLES[tool.name]) {
      setArguments(JSON.stringify(TOOL_EXAMPLES[tool.name], null, 2));
      return;
    }

    // Get output blob fields - these are handled automatically by the client
    // and should not be included in the default arguments
    const outputBlobFields = tool._awp?.blob?.output ?? [];

    // Generate default arguments from schema
    const schema = tool.inputSchema;
    if (schema && typeof schema === 'object' && 'properties' in schema) {
      const props = schema.properties as Record<string, { type?: string; default?: unknown }>;
      const defaultArgs: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(props)) {
        // Skip output blob fields - they are auto-generated by the client
        if (outputBlobFields.includes(key)) {
          continue;
        }
        if (prop.default !== undefined) {
          defaultArgs[key] = prop.default;
        } else if (prop.type === 'string') {
          defaultArgs[key] = '';
        } else if (prop.type === 'number') {
          defaultArgs[key] = 0;
        } else if (prop.type === 'boolean') {
          defaultArgs[key] = false;
        }
      }
      setArguments(JSON.stringify(defaultArgs, null, 2));
    }
  };

  const handleToolChange = (toolName: string) => {
    setSelectedTool(toolName);
    const tool = tools.find((t) => t.name === toolName);
    if (tool) {
      updateDefaultArgs(tool);
    }
  };

  const callTool = async () => {
    setLoading(true);
    setError('');
    setResponse(null);
    try {
      const args = JSON.parse(arguments_);

      // Build blob context if the tool has blob fields
      const inputBlobs = getInputBlobFields();
      const outputBlobs = getOutputBlobFields();

      let blobContext: {
        input: Record<string, string>;
        output: Record<string, string>;
        outputUri: Record<string, string>;
      } | undefined;

      if (inputBlobs.length > 0 || outputBlobs.length > 0) {
        const input: Record<string, string> = {};
        const output: Record<string, string> = {};
        const outputUri: Record<string, string> = {};

        // Determine API origin for blob URLs
        // For local dev with Vite proxy, API_BASE is empty, but server-side fetch
        // needs absolute URLs. Use window.location.origin as the base.
        // For production with explicit API_BASE, use that instead.
        const apiOrigin = API_BASE || window.location.origin;

        // For input blob fields, get the presigned URL from args
        // The URL should be:
        // 1. A full URL returned from prepare-upload (use as-is)
        // 2. A legacy relative path like /api/blob/temp/xxx (convert to full URL)
        for (const field of inputBlobs) {
          const value = args[field];
          if (typeof value === 'string') {
            if (value.startsWith('http://') || value.startsWith('https://')) {
              // Already a full URL
              input[field] = value;
            } else if (value.startsWith('/api/blob/')) {
              // Legacy relative path - convert to full URL using apiOrigin
              input[field] = `${apiOrigin}${value}`;
            }
          }
        }

        // For output blob fields, get presigned PUT URL from prepare-download
        const newOutputBlobUrls: Record<string, string> = {};
        for (const field of outputBlobs) {
          const res = await fetch(`${API_BASE}/api/blob/prepare-download`, { method: 'POST' });
          if (res.ok) {
            const data = await res.json() as { id: string; writeUrl: string; readUrl: string };
            // Server returns absolute URLs, use them directly
            output[field] = data.writeUrl;
            outputUri[field] = data.id; // Use ID as the permanent URI
            // Save readUrl for displaying the image after the call
            newOutputBlobUrls[field] = data.readUrl;
          }
        }
        setOutputBlobUrls(newOutputBlobUrls);

        blobContext = { input, output, outputUri };
      } else {
        setOutputBlobUrls({});
      }

      const result = await jsonRpc(
        'tools/call',
        {
          name: selectedTool,
          arguments: args,
          ...(blobContext && { _blobContext: blobContext }),
        },
        authState.status === 'authenticated' && isAuthPortal
      );

      // Check for 401
      if (result.response.status === 401) {
        const body = result.data as unknown as {
          auth_init_endpoint?: string;
          error_description?: string;
        };
        await handleUnauthorized(body);
        return;
      }

      setResponse(result.data);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON in arguments');
      } else {
        setError('Failed to call tool');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const selectedToolInfo = tools.find((t) => t.name === selectedTool);

  // Get input blob fields for current tool
  const getInputBlobFields = useCallback((): string[] => {
    const tool = tools.find((t) => t.name === selectedTool);
    if (!tool?._awp?.blob?.input) return [];
    return [...tool._awp.blob.input];
  }, [tools, selectedTool]);

  // Get output blob fields for current tool
  const getOutputBlobFields = useCallback((): string[] => {
    const tool = tools.find((t) => t.name === selectedTool);
    if (!tool?._awp?.blob?.output) return [];
    return [...tool._awp.blob.output];
  }, [tools, selectedTool]);

  // Handle file selection and upload for blob INPUT fields
  // This uploads the file and gets a temporary presigned GET URL (5 min TTL)
  const handleFileSelect = async (fieldName: string, file: File) => {
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('image', file);

      // Use prepare-upload to get a temporary presigned GET URL
      const res = await fetch(`${API_BASE}/api/blob/prepare-upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const result = await res.json() as { id: string; readUrl: string; expiresAt: string };
      setUploadedFiles((prev) => ({
        ...prev,
        [fieldName]: { key: result.readUrl, file },
      }));

      // Update arguments with the presigned GET URL and contentType
      try {
        const currentArgs = JSON.parse(arguments_);
        currentArgs[fieldName] = result.readUrl;
        // Auto-set contentType from file if not already set
        if (!currentArgs.contentType && file.type) {
          currentArgs.contentType = file.type;
        }
        setArguments(JSON.stringify(currentArgs, null, 2));
      } catch {
        // If arguments is not valid JSON, create new object with both fields
        const newArgs: Record<string, string> = { [fieldName]: result.readUrl };
        if (file.type) {
          newArgs.contentType = file.type;
        }
        setArguments(JSON.stringify(newArgs, null, 2));
      }
    } catch {
      setError('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  // Clear uploaded file for a field
  const clearUploadedFile = (fieldName: string) => {
    setUploadedFiles((prev) => {
      const newFiles = { ...prev };
      delete newFiles[fieldName];
      return newFiles;
    });

    try {
      const currentArgs = JSON.parse(arguments_);
      delete currentArgs[fieldName];
      setArguments(JSON.stringify(currentArgs, null, 2));
    } catch {
      // Ignore
    }
  };

  // Reset uploaded files when tool changes
  useEffect(() => {
    setUploadedFiles({});
  }, [selectedTool]);

  const getAuthChip = () => {
    if (!isAuthPortal) return null;

    switch (authState.status) {
      case 'authenticated': {
        const expiresIn = authExpiresAt ? Math.max(0, authExpiresAt - Date.now()) : 0;
        const expiresInHours = Math.floor(expiresIn / (1000 * 60 * 60));
        const expiresInMinutes = Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60));
        const expiryText =
          expiresIn > 0
            ? `Expires in ${expiresInHours}h ${expiresInMinutes}m`
            : 'Expired';

        return (
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title={expiryText}>
              <Chip
                icon={<LockOpenIcon />}
                label="Authenticated"
                color={expiresIn > 0 ? 'success' : 'warning'}
                size="small"
                variant="outlined"
              />
            </Tooltip>
            <Tooltip title="Logout">
              <IconButton size="small" onClick={handleLogout} color="default">
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        );
      }
      case 'pending':
      case 'polling':
        return (
          <Chip
            icon={<LockIcon />}
            label="Authenticating..."
            color="warning"
            size="small"
            variant="outlined"
          />
        );
      case 'failed':
        return (
          <Chip icon={<LockIcon />} label="Auth Failed" color="error" size="small" variant="outlined" />
        );
      default:
        return (
          <Chip
            icon={<LockIcon />}
            label="Not Authenticated"
            color="default"
            size="small"
            variant="outlined"
          />
        );
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h4" fontWeight={600}>
          {portalId?.charAt(0).toUpperCase()}
          {portalId?.slice(1)} Portal
        </Typography>
        <Chip label={endpoint} size="small" variant="outlined" />
        {getAuthChip()}
        <IconButton onClick={() => loadTools(authState.status === 'authenticated')} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {authState.status === 'failed' && authState.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {authState.error}
        </Alert>
      )}

      {!initialized && loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={24} />
          <Typography>Initializing portal...</Typography>
        </Box>
      )}

      {!initialized && authState.status === 'pending' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Authentication required. Please complete the login flow.
          <Button size="small" sx={{ ml: 2 }} onClick={() => setAuthDialogOpen(true)}>
            Open Login
          </Button>
        </Alert>
      )}

      {initialized && (
        <>
          {/* Blob Info Section - Only for blob portal */}
          {portalId === 'blob' && (
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Blob Portal - Image Storage Demo
              </Typography>
              <Typography variant="body2">
                <strong>put_image:</strong> Select a file below, it will be uploaded to a temporary URL (5 min TTL),
                then the tool reads from that URL and stores permanently. <em>(Demonstrates blob INPUT)</em>
              </Typography>
              <Typography variant="body2">
                <strong>get_image:</strong> Retrieves an image by key and writes to an output URL.
                <em>(Demonstrates blob OUTPUT)</em>
              </Typography>
              <Typography variant="body2">
                <strong>list_images:</strong> Lists all stored images with their keys.
              </Typography>
            </Alert>
          )}

          <Grid container spacing={3}>
            {/* Tool Selection */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Call Tool
                  </Typography>

                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Select Tool</InputLabel>
                    <Select
                      value={selectedTool}
                      label="Select Tool"
                      onChange={(e) => handleToolChange(e.target.value)}
                    >
                      {tools.map((tool) => (
                        <MenuItem key={tool.name} value={tool.name}>
                          {tool.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {selectedToolInfo && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {selectedToolInfo.description}
                    </Typography>
                  )}

                  {/* Blob Upload Fields */}
                  {getInputBlobFields().length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ImageIcon fontSize="small" />
                        File Upload
                      </Typography>
                      {getInputBlobFields().map((fieldName) => {
                        const uploadedFile = uploadedFiles[fieldName];

                        return (
                          <Box key={fieldName} sx={{ mb: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              {fieldName}
                            </Typography>
                            {uploadedFile ? (
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                <Chip
                                  icon={<ImageIcon />}
                                  label={uploadedFile.file.name}
                                  onDelete={() => clearUploadedFile(fieldName)}
                                  size="small"
                                  color="success"
                                />
                                <Typography variant="caption" color="text.secondary">
                                  ({(uploadedFile.file.size / 1024).toFixed(1)} KB)
                                </Typography>
                              </Stack>
                            ) : (
                              <Button
                                component="label"
                                variant="outlined"
                                size="small"
                                startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}
                                disabled={uploading}
                                sx={{ mt: 0.5 }}
                              >
                                {uploading ? 'Uploading...' : 'Select File'}
                                <input
                                  type="file"
                                  hidden
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleFileSelect(fieldName, file);
                                    }
                                  }}
                                />
                              </Button>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  )}

                  <TextField
                    fullWidth
                    label="Arguments (JSON)"
                    multiline
                    rows={getInputBlobFields().length > 0 ? 5 : 8}
                    value={arguments_}
                    onChange={(e) => setArguments(e.target.value)}
                    sx={{
                      mb: 2,
                      '& .MuiInputBase-input': {
                        fontFamily: 'monospace',
                        fontSize: 13,
                      },
                    }}
                  />

                  <Button
                    variant="contained"
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <PlayIcon />}
                    onClick={callTool}
                    disabled={loading || !selectedTool}
                    fullWidth
                  >
                    Execute
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            {/* Response */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}
                  >
                    <Typography variant="h6">Response</Typography>
                    {response && (
                      <Tooltip title="Copy">
                        <IconButton
                          size="small"
                          onClick={() => copyToClipboard(JSON.stringify(response, null, 2))}
                        >
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>

                  {/* Image Preview for output blobs */}
                  <ImagePreview response={response} getOutputBlobFields={getOutputBlobFields} outputBlobUrls={outputBlobUrls} />

                  <Box
                    sx={{
                      p: 2,
                      bgcolor: '#1e1e1e',
                      borderRadius: 1,
                      minHeight: 200,
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    <pre
                      style={{
                        margin: 0,
                        color: '#d4d4d4',
                        fontFamily: 'monospace',
                        fontSize: 13,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {response ? JSON.stringify(response, null, 2) : '// Response will appear here'}
                    </pre>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Available Tools */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Available Tools
              </Typography>
              {tools.map((tool) => (
                <Accordion key={tool.name}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Typography fontWeight={500}>{tool.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {tool.description}
                      </Typography>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="subtitle2" gutterBottom>
                      Input Schema:
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        p: 2,
                        bgcolor: '#f5f5f5',
                        borderRadius: 1,
                        overflow: 'auto',
                        fontSize: 12,
                      }}
                    >
                      {JSON.stringify(tool.inputSchema, null, 2)}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Grid>

            {/* Available Skills */}
            {Object.keys(skills).length > 0 && (
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SkillIcon color="primary" />
                  Available Skills
                </Typography>
                {Object.entries(skills).map(([skillName, skill]) => (
                  <Accordion key={skillName}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Typography fontWeight={500}>
                          {skill.frontmatter?.name || skillName}
                        </Typography>
                        {skill.frontmatter?.version && (
                          <Chip label={`v${skill.frontmatter.version}`} size="small" variant="outlined" />
                        )}
                        <Typography variant="body2" color="text.secondary">
                          {skill.frontmatter?.description}
                        </Typography>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Stack spacing={2}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle2" gutterBottom>
                              Skill URL:
                            </Typography>
                            <Chip
                              label={skill.url}
                              size="small"
                              sx={{ fontFamily: 'monospace' }}
                              onClick={() => copyToClipboard(skill.url)}
                              icon={<CopyIcon fontSize="small" />}
                            />
                          </Box>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<DownloadIcon />}
                            href={`${API_BASE}${skill.url}`}
                            download
                          >
                            Download
                          </Button>
                        </Box>

                        {skill.frontmatter?.['allowed-tools'] && skill.frontmatter['allowed-tools'].length > 0 && (
                          <Box>
                            <Typography variant="subtitle2" gutterBottom>
                              Allowed Tools:
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              {skill.frontmatter['allowed-tools'].map((toolName) => (
                                <Chip
                                  key={toolName}
                                  label={toolName}
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                  onClick={() => {
                                    const tool = tools.find(t => t.name === toolName);
                                    if (tool) {
                                      setSelectedTool(toolName);
                                      updateDefaultArgs(tool);
                                    }
                                  }}
                                  sx={{ cursor: 'pointer' }}
                                />
                              ))}
                            </Stack>
                          </Box>
                        )}

                        <Box>
                          <Typography variant="subtitle2" gutterBottom>
                            Frontmatter:
                          </Typography>
                          <Box
                            component="pre"
                            sx={{
                              p: 2,
                              bgcolor: '#f5f5f5',
                              borderRadius: 1,
                              overflow: 'auto',
                              fontSize: 12,
                            }}
                          >
                            {JSON.stringify(skill.frontmatter, null, 2)}
                          </Box>
                        </Box>
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Grid>
            )}
          </Grid>
        </>
      )}

      {/* Auth Dialog */}
      <Dialog open={authDialogOpen} onClose={() => setAuthDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Authentication Required</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            This portal requires authentication. Click the button below to open the login page.
          </Typography>

          {authState.verificationCode && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Verification Code:</strong> {authState.verificationCode}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                This code will be auto-filled on the login page.
              </Typography>
            </Alert>
          )}

          {authState.status === 'polling' && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Waiting for authorization...
              </Typography>
              <LinearProgress />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAuthDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={openAuthPage}
            disabled={!authState.authPageUrl || authState.status === 'polling'}
          >
            Open Login Page
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
