import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  CircularProgress,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  TextField,
  InputAdornment,
  LinearProgress,
} from "@mui/material";
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Storage as StorageIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  OpenInNew as OpenInNewIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { apiRequest, API_URL } from "../utils/api";

interface CasNode {
  key: string;
  realm: string;
  contentType?: string;
  size: number;
  createdAt: number;
  createdBy: string;
}

// Compute SHA-256 hash of content
async function computeHash(content: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", content);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Get file extension from content type
function getExtensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "text/plain": ".txt",
    "text/html": ".html",
    "text/css": ".css",
    "text/javascript": ".js",
    "application/json": ".json",
    "application/xml": ".xml",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
  };
  return map[contentType] || "";
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function getContentTypeColor(contentType: string): "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info" {
  if (contentType.startsWith("image/")) return "success";
  if (contentType.startsWith("video/")) return "secondary";
  if (contentType.startsWith("audio/")) return "warning";
  if (contentType.startsWith("text/")) return "info";
  if (contentType === "application/json") return "primary";
  return "default";
}

export default function Nodes() {
  const { getAccessToken, user } = useAuth();
  const [nodes, setNodes] = useState<CasNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [nextKey, setNextKey] = useState<string | undefined>();

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<CasNode | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Detail dialog
  const [detailNode, setDetailNode] = useState<CasNode | null>(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState("");

  // Download state
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchNodes = useCallback(async (resetPage = false) => {
    try {
      setLoading(true);
      setError("");

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        return;
      }

      // Use @me scope - backend will resolve to user's actual scope
      const scope = "@me";

      const params = new URLSearchParams({
        limit: rowsPerPage.toString(),
      });

      if (!resetPage && nextKey && page > 0) {
        params.append("startKey", nextKey);
      }

      const response = await apiRequest(`/api/cas/${scope}/nodes?${params}`, {}, accessToken);

      if (response.ok) {
        const data = await response.json();
        setNodes(data.nodes || []);
        setNextKey(data.nextKey);
        setTotalCount(data.total || data.nodes?.length || 0);
      } else if (response.status === 404) {
        // No nodes yet
        setNodes([]);
        setTotalCount(0);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to load nodes");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, user, rowsPerPage, page, nextKey]);

  useEffect(() => {
    fetchNodes(true);
  }, [rowsPerPage]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
    // For simplicity, we'll refetch. A production app would cache pages.
    fetchNodes(false);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(Number.parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleCopyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDeleteClick = (node: CasNode) => {
    setNodeToDelete(node);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!nodeToDelete) return;

    setDeleting(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        return;
      }

      const response = await apiRequest(
        `/api/cas/@me/node/${encodeURIComponent(nodeToDelete.key)}`,
        {
          method: "DELETE",
        },
        accessToken
      );

      if (response.ok) {
        setNodes((prev) => prev.filter((n) => n.key !== nodeToDelete.key));
        setDeleteDialogOpen(false);
        setTotalCount((prev) => Math.max(0, prev - 1));
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to delete node");
      }
    } catch {
      setError("Network error");
    } finally {
      setDeleting(false);
    }
  };

  // Upload file handler
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setUploadProgress(0);
      setError("");
      setUploadSuccess("");

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        return;
      }

      // Read file content
      const content = await file.arrayBuffer();
      setUploadProgress(30);

      // Compute hash for the key
      const hash = await computeHash(content);
      const key = `sha256:${hash}`;
      setUploadProgress(50);

      // Upload to CAS
      const response = await fetch(`${API_URL}/api/cas/@me/chunk/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: content,
      });

      setUploadProgress(90);

      if (response.ok) {
        const data = await response.json();
        setUploadSuccess(`Uploaded successfully! Key: ${data.key}`);
        setUploadProgress(100);
        // Refresh the list
        fetchNodes(true);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to upload file");
      }
    } catch (err) {
      setError("Upload failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Download file handler
  const handleDownload = async (node: CasNode) => {
    try {
      setDownloading(node.key);
      setError("");

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Not authenticated");
        return;
      }

      const response = await fetch(`${API_URL}/api/cas/@me/chunk/${encodeURIComponent(node.key)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        // Use content type to guess extension
        const ext = getExtensionFromContentType(node.contentType || "application/octet-stream");
        a.download = `${node.key.slice(0, 16)}${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || "Failed to download file");
      }
    } catch (err) {
      setError("Download failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setDownloading(null);
    }
  };

  const truncateKey = (key: string, maxLength = 20) => {
    if (key.length <= maxLength) return key;
    return `${key.slice(0, 12)}...${key.slice(-6)}`;
  };

  const filteredNodes = searchQuery
    ? nodes.filter(
      (node) =>
        node.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (node.contentType?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    )
    : nodes;

  if (loading && nodes.length === 0) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom>
            Nodes
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Browse and manage stored content nodes
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField
            size="small"
            placeholder="Search by key or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ width: 250 }}
          />
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
          <Button
            variant="contained"
            startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "Upload"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => fetchNodes(true)}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {uploadSuccess && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setUploadSuccess("")}>
          {uploadSuccess}
        </Alert>
      )}

      {uploading && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress variant="determinate" value={uploadProgress} />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            Uploading... {uploadProgress}%
          </Typography>
        </Box>
      )}

      {nodes.length === 0 && !loading ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 8 }}>
            <StorageIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No nodes found
            </Typography>
            <Typography variant="body2" color="text.disabled">
              Content stored through the CAS API will appear here
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Paper sx={{ width: "100%", overflow: "hidden" }}>
          <TableContainer>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Key</TableCell>
                  <TableCell>Content Type</TableCell>
                  <TableCell align="right">Size</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredNodes.map((node) => (
                  <TableRow
                    key={node.key}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => setDetailNode(node)}
                  >
                    <TableCell>
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Tooltip title={node.key}>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: "monospace" }}
                          >
                            {truncateKey(node.key)}
                          </Typography>
                        </Tooltip>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyKey(node.key);
                          }}
                        >
                          {copiedKey === node.key ? (
                            <CheckIcon fontSize="small" color="success" />
                          ) : (
                            <CopyIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={node.contentType ?? "unknown"}
                        size="small"
                        color={getContentTypeColor(node.contentType ?? "")}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      {formatBytes(node.size)}
                    </TableCell>
                    <TableCell>{formatDate(node.createdAt)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Download">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(node);
                          }}
                          disabled={downloading === node.key}
                        >
                          {downloading === node.key ? (
                            <CircularProgress size={16} />
                          ) : (
                            <DownloadIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(node);
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={totalCount}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Paper>
      )}

      {/* Node Detail Dialog */}
      <Dialog
        open={!!detailNode}
        onClose={() => setDetailNode(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Node Details</DialogTitle>
        <DialogContent>
          {detailNode && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Key
              </Typography>
              <Paper
                sx={{
                  p: 1.5,
                  mb: 2,
                  bgcolor: "grey.100",
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                  wordBreak: "break-all",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Box sx={{ flex: 1 }}>{detailNode.key}</Box>
                <IconButton
                  size="small"
                  onClick={() => handleCopyKey(detailNode.key)}
                >
                  {copiedKey === detailNode.key ? (
                    <CheckIcon fontSize="small" color="success" />
                  ) : (
                    <CopyIcon fontSize="small" />
                  )}
                </IconButton>
              </Paper>

              <Box sx={{ display: "flex", gap: 4, mb: 2 }}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Content Type
                  </Typography>
                  <Chip
                    label={detailNode.contentType ?? "unknown"}
                    size="small"
                    color={getContentTypeColor(detailNode.contentType ?? "")}
                  />
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Size
                  </Typography>
                  <Typography variant="body2">
                    {formatBytes(detailNode.size)}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: "flex", gap: 4 }}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Created
                  </Typography>
                  <Typography variant="body2">
                    {formatDate(detailNode.createdAt)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Created By
                  </Typography>
                  <Tooltip title={detailNode.createdBy}>
                    <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                      {truncateKey(detailNode.createdBy, 16)}
                    </Typography>
                  </Tooltip>
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {detailNode && (
            <Button
              startIcon={downloading === detailNode.key ? <CircularProgress size={16} /> : <DownloadIcon />}
              onClick={() => handleDownload(detailNode)}
              disabled={downloading === detailNode.key}
            >
              Download
            </Button>
          )}
          <Button onClick={() => setDetailNode(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Node?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this node? This action removes the
            ownership reference. The underlying content may be garbage collected
            if no other scopes reference it.
          </DialogContentText>
          {nodeToDelete && (
            <Paper
              sx={{
                p: 1.5,
                mt: 2,
                bgcolor: "grey.100",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                wordBreak: "break-all",
              }}
            >
              {nodeToDelete.key}
            </Paper>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? <CircularProgress size={20} /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
