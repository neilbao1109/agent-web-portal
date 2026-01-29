import { useState, useEffect, useCallback } from "react";
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
} from "@mui/material";
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Storage as StorageIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";

interface CasNode {
  key: string;
  scope: string;
  contentType: string;
  size: number;
  createdAt: number;
  createdBy: string;
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

      const response = await fetch(`/api/cas/${scope}/nodes?${params}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

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

      const response = await fetch(
        `/api/cas/@me/node/${encodeURIComponent(nodeToDelete.key)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
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

  const truncateKey = (key: string, maxLength = 20) => {
    if (key.length <= maxLength) return key;
    return `${key.slice(0, 12)}...${key.slice(-6)}`;
  };

  const filteredNodes = searchQuery
    ? nodes.filter(
        (node) =>
          node.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
          node.contentType.toLowerCase().includes(searchQuery.toLowerCase())
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
                        label={node.contentType}
                        size="small"
                        color={getContentTypeColor(node.contentType)}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      {formatBytes(node.size)}
                    </TableCell>
                    <TableCell>{formatDate(node.createdAt)}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(node);
                        }}
                        title="Delete Node"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
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
                    label={detailNode.contentType}
                    size="small"
                    color={getContentTypeColor(detailNode.contentType)}
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
              startIcon={<OpenInNewIcon />}
              onClick={() => {
                // Open in new tab - this would be the actual download URL
                window.open(
                  `/api/cas/@me/node/${encodeURIComponent(detailNode.key)}`,
                  "_blank"
                );
              }}
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
