/**
 * Example component demonstrating usage of @agent-web-portal/client-react
 *
 * This is a simple example showing how to use the new hooks.
 * The existing PortalTest.tsx can be gradually migrated to use this pattern.
 */

import { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useAwpAuth, useAwpClient } from "@agent-web-portal/client-react";

interface PortalTestNewProps {
  endpoint: string;
  clientName?: string;
}

/**
 * Example component using the new client-react hooks
 */
export function PortalTestNew({
  endpoint,
  clientName = "AWP UI Test",
}: PortalTestNewProps) {
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string>("");

  // Use the new auth hook
  const { isAuthenticated, authState, startAuth, cancelAuth, logout, auth } =
    useAwpAuth({
      endpoint,
      clientName,
      pollInterval: 10000, // 10 seconds
    });

  // Use the client hook (only when authenticated)
  const { callTool, listTools } = useAwpClient({
    endpoint,
    auth: isAuthenticated ? auth : undefined,
  });

  // Handle tool call
  const handleCallTool = async (toolName: string, args: Record<string, unknown>) => {
    setError("");
    try {
      const toolResult = await callTool(toolName, args);
      setResult(toolResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tool call failed");
    }
  };

  // Handle list tools
  const handleListTools = async () => {
    setError("");
    try {
      const tools = await listTools();
      setResult(tools);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list tools");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Portal Test (New Hooks)
          </Typography>

          {/* Auth Status */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Status: {authState.status}
            </Typography>
            {isAuthenticated && (
              <Typography variant="body2" color="success.main">
                ✓ Authenticated
              </Typography>
            )}
          </Box>

          {/* Error Display */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {authState.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {authState.error}
            </Alert>
          )}

          {/* Actions */}
          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            {!isAuthenticated ? (
              <Button
                variant="contained"
                onClick={startAuth}
                disabled={authState.status === "loading" || authState.status === "pending"}
              >
                {authState.status === "loading" ? (
                  <CircularProgress size={20} />
                ) : (
                  "Login"
                )}
              </Button>
            ) : (
              <>
                <Button variant="outlined" onClick={handleListTools}>
                  List Tools
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => handleCallTool("echo", { message: "Hello!" })}
                >
                  Call Echo Tool
                </Button>
                <Button variant="outlined" color="error" onClick={logout}>
                  Logout
                </Button>
              </>
            )}
          </Box>

          {/* Result Display */}
          {result !== null && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">Result:</Typography>
              <Box component="pre" sx={{ overflow: "auto", maxHeight: 300 }}>
                {JSON.stringify(result, null, 2)}
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Auth Dialog */}
      <Dialog
        open={authState.status === "pending" || authState.status === "polling"}
        onClose={cancelAuth}
      >
        <DialogTitle>Authorization Required</DialogTitle>
        <DialogContent>
          {authState.verificationCode && (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <Typography variant="h4" sx={{ fontFamily: "monospace", mb: 2 }}>
                {authState.verificationCode}
              </Typography>
              <Typography color="text.secondary">
                Enter this code on the authorization page
              </Typography>
            </Box>
          )}
          {authState.authUrl && (
            <Button
              variant="contained"
              href={authState.authUrl}
              target="_blank"
              fullWidth
              sx={{ mt: 2 }}
            >
              Open Authorization Page
            </Button>
          )}
          {authState.status === "polling" && (
            <Box sx={{ display: "flex", alignItems: "center", mt: 2, gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Waiting for authorization...
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelAuth}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default PortalTestNew;
