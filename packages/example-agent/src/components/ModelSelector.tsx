/**
 * Model Selector Component
 *
 * Dropdown to select a model from configured models
 */

import { useState } from "react";
import {
  Box,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Stack,
  Divider,
  Tooltip,
} from "@mui/material";
import {
  SmartToy,
  KeyboardArrowDown,
  Check,
  Settings,
} from "@mui/icons-material";
import type { ModelWithEndpoint, ModelTag } from "../storage";

const TAG_COLORS: Record<ModelTag, "default" | "primary" | "secondary" | "success" | "warning" | "info"> = {
  reasoning: "primary",
  vision: "secondary",
  fast: "success",
  "long-context": "info",
  cheap: "warning",
};

export interface ModelSelectorProps {
  models: ModelWithEndpoint[];
  selectedModel: ModelWithEndpoint | null;
  onSelectModel: (modelId: string) => Promise<void>;
  onOpenSettings?: () => void;
  disabled?: boolean;
  size?: "small" | "medium";
}

export function ModelSelector({
  models,
  selectedModel,
  onSelectModel,
  onOpenSettings,
  disabled = false,
  size = "small",
}: ModelSelectorProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelectModel = async (modelId: string) => {
    await onSelectModel(modelId);
    handleClose();
  };

  // Group models by endpoint
  const modelsByEndpoint = models.reduce(
    (acc, model) => {
      const endpointName = model.endpoint.name;
      if (!acc[endpointName]) {
        acc[endpointName] = [];
      }
      acc[endpointName].push(model);
      return acc;
    },
    {} as Record<string, ModelWithEndpoint[]>
  );

  const endpointNames = Object.keys(modelsByEndpoint);

  return (
    <>
      <Button
        variant="outlined"
        size={size}
        onClick={handleClick}
        disabled={disabled}
        endIcon={<KeyboardArrowDown />}
        sx={{
          textTransform: "none",
          justifyContent: "space-between",
          minWidth: 150,
          maxWidth: 250,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, overflow: "hidden" }}>
          <SmartToy fontSize="small" />
          <Typography
            variant="body2"
            noWrap
            sx={{ textOverflow: "ellipsis", overflow: "hidden" }}
          >
            {selectedModel?.displayName || "Select Model"}
          </Typography>
        </Box>
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { minWidth: 280, maxHeight: 400 },
        }}
      >
        {models.length === 0 ? (
          <MenuItem disabled>
            <ListItemText primary="No models configured" secondary="Add models in settings" />
          </MenuItem>
        ) : (
          endpointNames.map((endpointName, idx) => (
            <Box key={endpointName}>
              {idx > 0 && <Divider />}
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 2, py: 0.5, display: "block" }}
              >
                {endpointName}
              </Typography>
              {modelsByEndpoint[endpointName].map((model) => (
                <MenuItem
                  key={model.id}
                  onClick={() => handleSelectModel(model.id)}
                  selected={selectedModel?.id === model.id}
                >
                  <ListItemIcon>
                    {selectedModel?.id === model.id ? (
                      <Check fontSize="small" color="primary" />
                    ) : (
                      <SmartToy fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={model.displayName}
                    secondary={
                      model.displayName !== model.name ? model.name : undefined
                    }
                  />
                  <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
                    {model.tags.slice(0, 2).map((tag) => (
                      <Chip
                        key={tag}
                        size="small"
                        label={tag}
                        color={TAG_COLORS[tag]}
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.65rem" }}
                      />
                    ))}
                    {model.tags.length > 2 && (
                      <Tooltip title={model.tags.slice(2).join(", ")}>
                        <Chip
                          size="small"
                          label={`+${model.tags.length - 2}`}
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.65rem" }}
                        />
                      </Tooltip>
                    )}
                  </Stack>
                </MenuItem>
              ))}
            </Box>
          ))
        )}

        {onOpenSettings && (
          <>
            <Divider />
            <MenuItem
              onClick={() => {
                handleClose();
                onOpenSettings();
              }}
            >
              <ListItemIcon>
                <Settings fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Manage Models" />
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
}
