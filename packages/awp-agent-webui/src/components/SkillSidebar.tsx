/**
 * Skill Sidebar
 *
 * Shows available and active skills
 */

import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
  IconButton,
  Collapse,
  Paper,
} from '@mui/material';
import {
  Extension,
  Check,
  Add,
  Remove,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import { useState } from 'react';
import type { SkillInfo } from '../core';

export interface SkillSidebarProps {
  availableSkills: SkillInfo[];
  activeSkillIds: string[];
  onLoadSkill: (skillId: string) => Promise<void>;
  onUnloadSkill: (skillId: string) => void;
}

export function SkillSidebar({
  availableSkills,
  activeSkillIds,
  onLoadSkill,
  onUnloadSkill,
}: SkillSidebarProps) {
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());

  // Group skills by endpoint
  const skillsByEndpoint = availableSkills.reduce(
    (acc, skill) => {
      if (!acc[skill.endpointId]) {
        acc[skill.endpointId] = [];
      }
      acc[skill.endpointId].push(skill);
      return acc;
    },
    {} as Record<string, SkillInfo[]>
  );

  const toggleEndpoint = (endpointId: string) => {
    setExpandedEndpoints((prev) => {
      const next = new Set(prev);
      if (next.has(endpointId)) {
        next.delete(endpointId);
      } else {
        next.add(endpointId);
      }
      return next;
    });
  };

  const handleLoadSkill = async (skillId: string) => {
    setLoading((prev) => new Set(prev).add(skillId));
    try {
      await onLoadSkill(skillId);
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(skillId);
        return next;
      });
    }
  };

  const activeSkills = availableSkills.filter((s) => activeSkillIds.includes(s.fullId));

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Active Skills */}
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Active Skills ({activeSkills.length})
        </Typography>
        {activeSkills.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            No skills loaded
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {activeSkills.map((skill) => (
              <Chip
                key={skill.fullId}
                label={skill.frontmatter.name ?? skill.skillName}
                size="small"
                color="primary"
                onDelete={() => onUnloadSkill(skill.fullId)}
                icon={<Check fontSize="small" />}
              />
            ))}
          </Box>
        )}
      </Box>

      <Divider />

      {/* Available Skills */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Box sx={{ p: 2, pb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Available Skills
          </Typography>
        </Box>

        {Object.keys(skillsByEndpoint).length === 0 ? (
          <Paper sx={{ m: 2, p: 2, textAlign: 'center' }} variant="outlined">
            <Extension sx={{ fontSize: 32, color: 'text.secondary', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No skills available. Add an AWP endpoint first.
            </Typography>
          </Paper>
        ) : (
          <List dense>
            {Object.entries(skillsByEndpoint).map(([endpointId, skills]) => (
              <Box key={endpointId}>
                <ListItemButton onClick={() => toggleEndpoint(endpointId)}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={endpointId}
                          size="small"
                          variant="outlined"
                          sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                        />
                        <Typography variant="body2">({skills.length} skills)</Typography>
                      </Box>
                    }
                  />
                  {expandedEndpoints.has(endpointId) ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>

                <Collapse in={expandedEndpoints.has(endpointId)} timeout="auto">
                  <List component="div" disablePadding>
                    {skills.map((skill) => {
                      const isActive = activeSkillIds.includes(skill.fullId);
                      const isLoading = loading.has(skill.fullId);

                      return (
                        <ListItem
                          key={skill.fullId}
                          sx={{ pl: 4 }}
                          secondaryAction={
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() =>
                                isActive
                                  ? onUnloadSkill(skill.fullId)
                                  : handleLoadSkill(skill.fullId)
                              }
                              disabled={isLoading}
                              color={isActive ? 'error' : 'primary'}
                            >
                              {isActive ? <Remove /> : <Add />}
                            </IconButton>
                          }
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <Extension
                              fontSize="small"
                              color={isActive ? 'primary' : 'disabled'}
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={skill.frontmatter.name ?? skill.skillName}
                            secondary={skill.frontmatter.description}
                            primaryTypographyProps={{
                              variant: 'body2',
                              fontWeight: isActive ? 'medium' : 'normal',
                            }}
                            secondaryTypographyProps={{
                              variant: 'caption',
                              noWrap: true,
                            }}
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}
