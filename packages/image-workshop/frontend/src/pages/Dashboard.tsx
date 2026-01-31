import {
  Box,
  Card,
  CardContent,
  Grid2 as Grid,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  Snackbar,
} from "@mui/material";
import {
  Computer as ComputerIcon,
  Image as ImageIcon,
  AutoAwesome as AutoAwesomeIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  Link as LinkIcon,
} from "@mui/icons-material";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

interface Client {
  pubkey: string;
  clientName: string;
  createdAt: string;
  expiresAt: string | null;
}

export default function Dashboard() {
  const { getAccessToken, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Get the endpoint URL (current origin + /api/)
  // Note: trailing slash is required for CloudFront routing
  const endpointUrl = `${window.location.origin}/api/`;

  const handleCopyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpointUrl);
      setCopied(true);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;

        const response = await fetch("/api/auth/agent-tokens/clients", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setClients(data.clients || []);
        }
      } catch (err) {
        console.error("Failed to fetch clients:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, [getAccessToken]);

  const activeClients = clients.filter(
    (c) => !c.expiresAt || new Date(c.expiresAt) > new Date()
  ).length;

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Welcome back, {user?.name || user?.email}
      </Typography>

      {/* Endpoint URL Card */}
      <Card
        sx={{
          mb: 4,
          background: "linear-gradient(135deg, #7c4dff 0%, #ff4081 100%)",
          color: "white",
        }}
      >
        <CardContent sx={{ py: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
            <LinkIcon />
            <Typography variant="h6" fontWeight={600}>
              MCP Server Endpoint
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ opacity: 0.9, mb: 2 }}>
            Use this URL to configure your AI agent (Claude, Cursor, etc.)
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              bgcolor: "rgba(255,255,255,0.15)",
              borderRadius: 2,
              px: 2,
              py: 1.5,
            }}
          >
            <Typography
              variant="body1"
              sx={{
                fontFamily: "monospace",
                fontSize: "1.1rem",
                flexGrow: 1,
                wordBreak: "break-all",
              }}
            >
              {endpointUrl}
            </Typography>
            <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
              <IconButton
                onClick={handleCopyEndpoint}
                sx={{
                  color: "white",
                  bgcolor: "rgba(255,255,255,0.2)",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
                }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </CardContent>
      </Card>

      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        message="Endpoint URL copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: "primary.light",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ComputerIcon sx={{ color: "white" }} />
                </Box>
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    {loading ? "-" : activeClients}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active AI Clients
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: "secondary.light",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ImageIcon sx={{ color: "white" }} />
                </Box>
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    16
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Available Tools
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: "success.light",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AutoAwesomeIcon sx={{ color: "white" }} />
                </Box>
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    2
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    AI Providers
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h5" fontWeight={600} gutterBottom>
        Available Tools
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" fontWeight={600} color="primary" gutterBottom>
              FLUX (Black Forest Labs)
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 3 }}>
              <li>flux_pro - High-quality text-to-image generation</li>
              <li>flux_flex - Flexible aspect ratio generation</li>
              <li>flux_fill - Inpainting/filling masked regions</li>
              <li>flux_expand - Outpainting/image expansion</li>
              <li>flux_kontext - Context-aware image editing</li>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" fontWeight={600} color="secondary" gutterBottom>
              Stability AI
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 3 }}>
              <li>txt2img - Text-to-image with SDXL</li>
              <li>inpaint - Fill masked regions</li>
              <li>erase - Remove objects from images</li>
              <li>outpaint - Extend image borders</li>
              <li>remove_bg - Remove background</li>
              <li>search_replace - Find and replace objects</li>
              <li>search_recolor - Find and recolor objects</li>
              <li>sketch - Generate from sketches</li>
              <li>structure - Structure-guided generation</li>
              <li>style - Apply artistic styles</li>
              <li>transfer - Style transfer between images</li>
            </Box>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
