/**
 * Model Manager Component
 *
 * Manages endpoints and models in a two-level hierarchy
 */

import { useState } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Stack,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from "@mui/material";
import {
  Add,
  Delete,
  Edit,
  ExpandMore,
  Visibility,
  VisibilityOff,
  Api,
  SmartToy,
} from "@mui/icons-material";
import type { Endpoint, Model, ModelTag, ModelType, ModelWithEndpoint } from "../storage";

// Common input style to prevent iOS zoom
const inputStyle = {
  "& .MuiInputBase-root": {
    fontSize: { xs: "16px", sm: "inherit" },
  },
};

// Preset tags with colors
const PRESET_TAGS: { value: string; label: string; color: "default" | "primary" | "secondary" | "success" | "warning" | "info" }[] = [
  { value: "reasoning", label: "Reasoning", color: "primary" },
  { value: "vision", label: "Vision", color: "secondary" },
  { value: "fast", label: "Fast", color: "success" },
  { value: "long-context", label: "Long Context", color: "info" },
  { value: "cheap", label: "Cheap", color: "warning" },
];

// Get color for a tag (preset or default for custom)
export const getTagColor = (tag: string): "default" | "primary" | "secondary" | "success" | "warning" | "info" => {
  const preset = PRESET_TAGS.find((t) => t.value === tag);
  return preset?.color || "default";
};

// Get label for a tag (preset label or the tag itself for custom)
export const getTagLabel = (tag: string): string => {
  const preset = PRESET_TAGS.find((t) => t.value === tag);
  return preset?.label || tag;
};

export interface ModelManagerProps {
  endpoints: Endpoint[];
  models: ModelWithEndpoint[];
  onAddEndpoint: (endpoint: Omit<Endpoint, "id" | "createdAt" | "updatedAt">) => Promise<Endpoint>;
  onUpdateEndpoint: (endpoint: Endpoint) => Promise<Endpoint>;
  onDeleteEndpoint: (id: string) => Promise<void>;
  onAddModel: (model: Omit<Model, "id" | "createdAt" | "updatedAt">) => Promise<Model>;
  onUpdateModel: (model: Model) => Promise<Model>;
  onDeleteModel: (id: string) => Promise<void>;
}

interface EndpointFormData {
  name: string;
  url: string;
  apiKey: string;
}

interface ModelFormData {
  endpointId: string;
  name: string;
  displayName: string;
  type: ModelType;
  tags: ModelTag[];
  contextLength: number;
}

export function ModelManager({
  endpoints,
  models,
  onAddEndpoint,
  onUpdateEndpoint,
  onDeleteEndpoint,
  onAddModel,
  onUpdateModel,
  onDeleteModel,
}: ModelManagerProps) {
  // Endpoint dialog state
  const [endpointDialogOpen, setEndpointDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [endpointForm, setEndpointForm] = useState<EndpointFormData>({
    name: "",
    url: "",
    apiKey: "",
  });
  const [showApiKey, setShowApiKey] = useState(false);

  // Model dialog state
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [modelForm, setModelForm] = useState<ModelFormData>({
    endpointId: "",
    name: "",
    displayName: "",
    type: "openai",
    tags: [],
    contextLength: 128000,
  });

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset endpoint form
  const resetEndpointForm = () => {
    setEndpointForm({ name: "", url: "", apiKey: "" });
    setEditingEndpoint(null);
    setShowApiKey(false);
    setError(null);
  };

  // Reset model form
  const resetModelForm = () => {
    setModelForm({
      endpointId: endpoints[0]?.id || "",
      name: "",
      displayName: "",
      type: "openai",
      tags: [],
      contextLength: 128000,
    });
    setEditingModel(null);
    setError(null);
  };

  // Open endpoint dialog for adding
  const handleAddEndpoint = () => {
    resetEndpointForm();
    setEndpointDialogOpen(true);
  };

  // Open endpoint dialog for editing
  const handleEditEndpoint = (endpoint: Endpoint) => {
    setEditingEndpoint(endpoint);
    setEndpointForm({
      name: endpoint.name,
      url: endpoint.url,
      apiKey: endpoint.apiKey,
    });
    setEndpointDialogOpen(true);
  };

  // Save endpoint
  const handleSaveEndpoint = async () => {
    if (!endpointForm.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!endpointForm.url.trim()) {
      setError("URL is required");
      return;
    }
    if (!endpointForm.apiKey.trim()) {
      setError("API Key is required");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      if (editingEndpoint) {
        await onUpdateEndpoint({
          ...editingEndpoint,
          name: endpointForm.name.trim(),
          url: endpointForm.url.trim(),
          apiKey: endpointForm.apiKey.trim(),
        });
      } else {
        await onAddEndpoint({
          name: endpointForm.name.trim(),
          url: endpointForm.url.trim(),
          apiKey: endpointForm.apiKey.trim(),
        });
      }
      setEndpointDialogOpen(false);
      resetEndpointForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save endpoint");
    } finally {
      setSaving(false);
    }
  };

  // Open model dialog for adding
  const handleAddModel = (endpointId?: string) => {
    resetModelForm();
    if (endpointId) {
      setModelForm((prev) => ({ ...prev, endpointId }));
    } else if (endpoints.length > 0) {
      setModelForm((prev) => ({ ...prev, endpointId: endpoints[0].id }));
    }
    setModelDialogOpen(true);
  };

  // Open model dialog for editing
  const handleEditModel = (model: Model) => {
    setEditingModel(model);
    setModelForm({
      endpointId: model.endpointId,
      name: model.name,
      displayName: model.displayName,
      type: model.type,
      tags: [...model.tags],
      contextLength: model.contextLength,
    });
    setModelDialogOpen(true);
  };

  // Save model
  const handleSaveModel = async () => {
    if (!modelForm.endpointId) {
      setError("Endpoint is required");
      return;
    }
    if (!modelForm.name.trim()) {
      setError("Model name is required");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const displayName = modelForm.displayName.trim() || modelForm.name.trim();
      if (editingModel) {
        await onUpdateModel({
          ...editingModel,
          endpointId: modelForm.endpointId,
          name: modelForm.name.trim(),
          displayName,
          type: modelForm.type,
          tags: modelForm.tags,
          contextLength: modelForm.contextLength,
        });
      } else {
        await onAddModel({
          endpointId: modelForm.endpointId,
          name: modelForm.name.trim(),
          displayName,
          type: modelForm.type,
          tags: modelForm.tags,
          contextLength: modelForm.contextLength,
        });
      }
      setModelDialogOpen(false);
      resetModelForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setSaving(false);
    }
  };

  // Toggle tag
  const toggleTag = (tag: ModelTag) => {
    setModelForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  // Group models by endpoint
  const modelsByEndpoint = endpoints.reduce(
    (acc, endpoint) => {
      acc[endpoint.id] = models.filter((m) => m.endpointId === endpoint.id);
      return acc;
    },
    {} as Record<string, ModelWithEndpoint[]>
  );

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Model Configuration
        </Typography>
        <Button
          size="small"
          startIcon={<Add />}
          onClick={handleAddEndpoint}
        >
          Add Endpoint
        </Button>
      </Box>

      {endpoints.length === 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          No endpoints configured. Add an endpoint to get started.
        </Alert>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {endpoints.map((endpoint) => (
            <Accordion key={endpoint.id} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                  <Api fontSize="small" color="primary" />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {endpoint.name}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${modelsByEndpoint[endpoint.id]?.length || 0} models`}
                    variant="outlined"
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                    {endpoint.url}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                  <Button
                    size="small"
                    startIcon={<Edit />}
                    onClick={() => handleEditEndpoint(endpoint)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    startIcon={<Add />}
                    onClick={() => handleAddModel(endpoint.id)}
                  >
                    Add Model
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<Delete />}
                    onClick={() => onDeleteEndpoint(endpoint.id)}
                  >
                    Delete
                  </Button>
                </Box>
                <Divider sx={{ mb: 1 }} />
                {modelsByEndpoint[endpoint.id]?.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No models configured for this endpoint.
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {modelsByEndpoint[endpoint.id]?.map((model) => (
                      <ListItem key={model.id} disablePadding sx={{ py: 0.5 }}>
                        <ListItemText
                          primary={
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <SmartToy fontSize="small" color="action" />
                              <Typography variant="body2">{model.displayName}</Typography>
                              {model.displayName !== model.name && (
                                <Typography variant="caption" color="text.secondary">
                                  ({model.name})
                                </Typography>
                              )}
                            </Box>
                          }
                          secondary={
                            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} component="span">
                              <Chip size="small" label={model.type} variant="outlined" />
                              <Chip size="small" label={`${(model.contextLength / 1000).toFixed(0)}K`} variant="outlined" />
                              {model.tags.map((tag) => (
                                <Chip
                                  key={tag}
                                  size="small"
                                  label={getTagLabel(tag)}
                                  color={getTagColor(tag)}
                                  variant="outlined"
                                />
                              ))}
                            </Stack>
                          }
                          secondaryTypographyProps={{ component: "div" }}
                        />
                        <ListItemSecondaryAction>
                          <IconButton size="small" onClick={() => handleEditModel(model)}>
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => onDeleteModel(model.id)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      {/* Endpoint Dialog */}
      <Dialog open={endpointDialogOpen} onClose={() => setEndpointDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingEndpoint ? "Edit Endpoint" : "Add Endpoint"}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Name"
              value={endpointForm.name}
              onChange={(e) => setEndpointForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
              size="small"
              placeholder="e.g., OpenAI, Azure OpenAI, Local LLM"
              sx={inputStyle}
            />
            <TextField
              label="API URL"
              value={endpointForm.url}
              onChange={(e) => setEndpointForm((prev) => ({ ...prev, url: e.target.value }))}
              fullWidth
              size="small"
              placeholder="https://api.openai.com/v1/chat/completions"
              sx={inputStyle}
            />
            <TextField
              label="API Key"
              type={showApiKey ? "text" : "password"}
              value={endpointForm.apiKey}
              onChange={(e) => setEndpointForm((prev) => ({ ...prev, apiKey: e.target.value }))}
              fullWidth
              size="small"
              sx={inputStyle}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowApiKey(!showApiKey)} edge="end" size="small">
                      {showApiKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEndpointDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEndpoint} variant="contained" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Model Dialog */}
      <Dialog open={modelDialogOpen} onClose={() => setModelDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingModel ? "Edit Model" : "Add Model"}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <FormControl fullWidth size="small" sx={inputStyle}>
              <InputLabel>Endpoint</InputLabel>
              <Select
                value={modelForm.endpointId}
                label="Endpoint"
                onChange={(e) => setModelForm((prev) => ({ ...prev, endpointId: e.target.value }))}
              >
                {endpoints.map((ep) => (
                  <MenuItem key={ep.id} value={ep.id}>
                    {ep.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Model Name"
              value={modelForm.name}
              onChange={(e) => setModelForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
              size="small"
              placeholder="e.g., gpt-4o, claude-3-5-sonnet-20241022"
              helperText="The model identifier used in API calls"
              sx={inputStyle}
            />

            <TextField
              label="Display Name"
              value={modelForm.displayName}
              onChange={(e) => setModelForm((prev) => ({ ...prev, displayName: e.target.value }))}
              fullWidth
              size="small"
              placeholder="Leave empty to use model name"
              helperText="Optional friendly name shown in the UI"
              sx={inputStyle}
            />

            <FormControl fullWidth size="small" sx={inputStyle}>
              <InputLabel>API Type</InputLabel>
              <Select
                value={modelForm.type}
                label="API Type"
                onChange={(e) => setModelForm((prev) => ({ ...prev, type: e.target.value as ModelType }))}
              >
                <MenuItem value="openai">OpenAI</MenuItem>
                <MenuItem value="anthropic">Anthropic</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Context Length (K)"
              type="number"
              value={modelForm.contextLength / 1000}
              onChange={(e) => {
                const kValue = Number(e.target.value);
                if (kValue >= 0) {
                  setModelForm((prev) => ({ ...prev, contextLength: kValue * 1000 }));
                }
              }}
              fullWidth
              size="small"
              placeholder="e.g., 128 for 128K"
              helperText="Context window size in thousands of tokens"
              sx={inputStyle}
              InputProps={{
                endAdornment: <InputAdornment position="end">K tokens</InputAdornment>,
              }}
            />

            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Tags
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                {PRESET_TAGS.map((tag) => (
                  <Chip
                    key={tag.value}
                    label={tag.label}
                    color={modelForm.tags.includes(tag.value) ? tag.color : "default"}
                    variant={modelForm.tags.includes(tag.value) ? "filled" : "outlined"}
                    onClick={() => toggleTag(tag.value)}
                    sx={{ cursor: "pointer" }}
                  />
                ))}
              </Stack>
              {/* Custom tags */}
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                {modelForm.tags
                  .filter((tag) => !PRESET_TAGS.some((pt) => pt.value === tag))
                  .map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      onDelete={() => toggleTag(tag)}
                      sx={{ height: 24 }}
                    />
                  ))}
              </Stack>
              <TextField
                size="small"
                placeholder="Add custom tag and press Enter"
                fullWidth
                sx={inputStyle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const input = e.target as HTMLInputElement;
                    const value = input.value.trim();
                    if (value && !modelForm.tags.includes(value)) {
                      setModelForm((prev) => ({ ...prev, tags: [...prev.tags, value] }));
                      input.value = "";
                    }
                  }
                }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModelDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveModel} variant="contained" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
