/**
 * Conversation List
 *
 * Sidebar for conversation history
 */

import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Divider,
  Button,
} from '@mui/material';
import { Add, Delete, Chat } from '@mui/icons-material';
import type { Conversation } from '../storage';

export interface ConversationListProps {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ConversationList({
  conversations,
  currentId,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getPreview = (conversation: Conversation) => {
    const lastUserMessage = [...conversation.messages]
      .reverse()
      .find((m) => m.role === 'user');
    return lastUserMessage?.content?.substring(0, 50) || 'No messages';
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2 }}>
        <Button
          variant="contained"
          startIcon={<Add />}
          fullWidth
          onClick={onCreate}
        >
          New Chat
        </Button>
      </Box>

      <Divider />

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {conversations.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Chat sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography color="text.secondary" variant="body2">
              No conversations yet
            </Typography>
          </Box>
        ) : (
          <List dense>
            {conversations.map((conversation) => (
              <ListItem
                key={conversation.id}
                disablePadding
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conversation.id);
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemButton
                  selected={conversation.id === currentId}
                  onClick={() => onSelect(conversation.id)}
                >
                  <ListItemText
                    primary={conversation.title}
                    secondary={
                      <Box
                        component="span"
                        sx={{ display: 'flex', justifyContent: 'space-between' }}
                      >
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          sx={{ flex: 1, mr: 1 }}
                        >
                          {getPreview(conversation)}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary">
                          {formatDate(conversation.updatedAt)}
                        </Typography>
                      </Box>
                    }
                    primaryTypographyProps={{
                      noWrap: true,
                      variant: 'body2',
                      fontWeight: conversation.id === currentId ? 'medium' : 'normal',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}
