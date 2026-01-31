import { useState, useEffect } from "react";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Alert,
} from "@mui/material";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1976d2",
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
}

interface HelloResponse {
  message: string;
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check API health on mount
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch((err) => setHealthError(err.message));
  }, []);

  const handleSayHello = async () => {
    setLoading(true);
    try {
      const params = name ? `?name=${encodeURIComponent(name)}` : "";
      const res = await fetch(`/api/hello${params}`);
      const data: HelloResponse = await res.json();
      setGreeting(data.message);
    } catch (err) {
      setGreeting(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom align="center">
          🚀 AWS Lambda Fullstack
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" align="center" sx={{ mb: 4 }}>
          SAM Backend + React Frontend Template
        </Typography>

        {/* Health Status */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            API Health Status
          </Typography>
          {healthError ? (
            <Alert severity="error">API Error: {healthError}</Alert>
          ) : health ? (
            <Alert severity="success">
              Status: {health.status} | Service: {health.service}
              <br />
              Timestamp: {health.timestamp}
            </Alert>
          ) : (
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={20} />
              <Typography>Checking API health...</Typography>
            </Box>
          )}
        </Paper>

        {/* Hello API Demo */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Hello API Demo
          </Typography>
          <Box display="flex" gap={2} mb={2}>
            <TextField
              label="Your Name"
              variant="outlined"
              size="small"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              placeholder="Enter your name (optional)"
            />
            <Button
              variant="contained"
              onClick={handleSayHello}
              disabled={loading}
              sx={{ minWidth: 120 }}
            >
              {loading ? <CircularProgress size={24} /> : "Say Hello"}
            </Button>
          </Box>
          {greeting && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {greeting}
            </Alert>
          )}
        </Paper>

        <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 4 }}>
          Edit this template to build your fullstack application!
        </Typography>
      </Container>
    </ThemeProvider>
  );
}

export default App;
