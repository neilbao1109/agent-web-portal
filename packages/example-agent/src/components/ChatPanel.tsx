/**
 * Chat Panel
 *
 * Main chat interface with message display and input
 */

import { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Paper,
  Typography,
  CircularProgress,
  Chip,
  Collapse,
  Switch,
  FormControlLabel,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Send, Stop, ExpandMore, ExpandLess, Build, Code } from '@mui/icons-material';
import type { Message } from '../storage';
import type { AgentState, StreamingMessage } from '../hooks/useAgent';
import { BlobMarkdown } from './BlobMarkdown';
import { useStorage } from '../contexts/StorageContext';

export interface ChatPanelProps {
  messages: Message[];
  streamingMessage: StreamingMessage | null;
  state: AgentState;
  error: string | null;
  onSendMessage: (content: string) => Promise<void>;
  onStop: () => void;
}

export function ChatPanel({
  messages,
  streamingMessage,
  state,
  error,
  onSendMessage,
  onStop,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || state !== 'idle') return;

    setInput('');
    await onSendMessage(content);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isProcessing = state !== 'idle' && state !== 'error';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 1, sm: 2 } }}>
        {messages.length === 0 && !streamingMessage && (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 2,
            }}
          >
            <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
              Start a conversation or load a skill to begin.
            </Typography>
          </Box>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} isMobile={isMobile} />
        ))}

        {/* Streaming message */}
        {streamingMessage && (
          <StreamingMessageBubble streamingMessage={streamingMessage} isMobile={isMobile} />
        )}

        {/* Error */}
        {error && (
          <Paper sx={{ p: 2, bgcolor: 'error.light', color: 'error.contrastText', mb: 2 }}>
            <Typography variant="body2">{error}</Typography>
          </Paper>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Paper 
        sx={{ 
          p: { xs: 1.5, sm: 2 }, 
          borderTop: 1, 
          borderColor: 'divider',
          // Safe area for mobile devices with home indicator
          pb: { xs: 'max(env(safe-area-inset-bottom), 12px)', sm: 2 },
        }} 
        elevation={0}
      >
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            inputRef={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            multiline
            maxRows={4}
            fullWidth
            size="small"
            disabled={isProcessing}
            sx={{
              '& .MuiInputBase-root': {
                fontSize: { xs: '16px', sm: 'inherit' }, // Prevent zoom on iOS
              },
            }}
          />
          {isProcessing ? (
            <IconButton onClick={onStop} color="error" size={isMobile ? 'medium' : 'large'}>
              <Stop />
            </IconButton>
          ) : (
            <IconButton 
              onClick={handleSend} 
              color="primary" 
              disabled={!input.trim()}
              size={isMobile ? 'medium' : 'large'}
            >
              <Send />
            </IconButton>
          )}
        </Box>
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {state === 'streaming' && (
            <Chip
              size="small"
              icon={<CircularProgress size={12} />}
              label={isMobile ? "..." : "Generating..."}
              variant="outlined"
            />
          )}
          {state === 'calling_tool' && (
            <Chip
              size="small"
              icon={<CircularProgress size={12} />}
              label={isMobile ? "Tool..." : "Calling tool..."}
              variant="outlined"
              color="secondary"
            />
          )}
          {state === 'thinking' && (
            <Chip
              size="small"
              icon={<CircularProgress size={12} />}
              label={isMobile ? "..." : "Thinking..."}
              variant="outlined"
            />
          )}
        </Box>
      </Paper>
    </Box>
  );
}

/**
 * Message Bubble Component
 */
function MessageBubble({ message, isMobile }: { message: Message; isMobile?: boolean }) {
  const [toolExpanded, setToolExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const storage = useStorage();

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  // Don't show tool messages as bubbles, they're shown inline with the tool call
  if (isTool) {
    return null;
  }

  return (
    <Box
      sx={{
        mb: { xs: 1.5, sm: 2 },
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <Paper
        sx={{
          p: { xs: 1.5, sm: 2 },
          maxWidth: isMobile ? '90%' : '80%',
          bgcolor: isUser ? 'primary.main' : 'grey.100',
          color: isUser ? 'primary.contrastText' : 'text.primary',
          borderRadius: 2,
        }}
      >
        {/* Raw/Markdown Toggle for assistant messages */}
        {isAssistant && message.content && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showRaw}
                  onChange={(e) => setShowRaw(e.target.checked)}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Code fontSize="small" />
                  <Typography variant="caption">Raw</Typography>
                </Box>
              }
              sx={{ m: 0 }}
            />
          </Box>
        )}

        {/* Content */}
        {message.content && (
          showRaw ? (
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1,
                bgcolor: isUser ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                borderRadius: 1,
                fontSize: '0.8rem',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'monospace',
              }}
            >
              {message.content}
            </Box>
          ) : (
            <Box
              sx={{
                '& > *:first-of-type': { mt: 0 },
                '& > *:last-child': { mb: 0 },
                '& code': {
                  bgcolor: isUser ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                  px: 0.5,
                  borderRadius: 0.5,
                  fontFamily: 'monospace',
                },
                '& pre': {
                  bgcolor: isUser ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                  p: 1,
                  borderRadius: 1,
                  overflow: 'auto',
                },
                '& img': {
                  maxWidth: '100%',
                  borderRadius: 1,
                  mt: 1,
                },
              }}
            >
              <BlobMarkdown storage={storage ?? undefined}>{message.content}</BlobMarkdown>
            </Box>
          )
        )}

        {/* Tool calls */}
        {isAssistant && message.toolCalls && message.toolCalls.length > 0 && (
          <Box sx={{ mt: message.content ? 1 : 0 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
              }}
              onClick={() => setToolExpanded(!toolExpanded)}
            >
              <Build fontSize="small" sx={{ mr: 0.5 }} />
              <Typography variant="caption">
                {message.toolCalls.length} tool call{message.toolCalls.length > 1 ? 's' : ''}
              </Typography>
              {toolExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </Box>

            <Collapse in={toolExpanded}>
              <Box sx={{ mt: 1 }}>
                {message.toolCalls.map((tc) => (
                  <Paper
                    key={tc.id}
                    sx={{
                      p: 1,
                      mb: 1,
                      bgcolor: 'background.paper',
                      border: 1,
                      borderColor: 'divider',
                    }}
                    variant="outlined"
                  >
                    <Typography variant="caption" fontWeight="medium" color="text.primary">
                      {tc.name}
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        mt: 0.5,
                        mb: 0,
                        p: 1,
                        bgcolor: 'grey.50',
                        borderRadius: 1,
                        fontSize: '0.75rem',
                        overflow: 'auto',
                        color: 'text.primary',
                      }}
                    >
                      {JSON.stringify(tc.arguments, null, 2)}
                    </Box>
                  </Paper>
                ))}
              </Box>
            </Collapse>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
/**
 * Streaming Message Bubble Component
 */
function StreamingMessageBubble({ streamingMessage, isMobile }: { streamingMessage: StreamingMessage; isMobile?: boolean }) {
  const storage = useStorage();

  return (
    <Box sx={{ mb: { xs: 1.5, sm: 2 } }}>
      <Paper
        sx={{
          p: { xs: 1.5, sm: 2 },
          maxWidth: isMobile ? '90%' : '80%',
          bgcolor: 'grey.100',
          borderRadius: 2,
        }}
      >
        {streamingMessage.content && (
          <Box sx={{ '& > *:first-of-type': { mt: 0 }, '& > *:last-child': { mb: 0 } }}>
            <BlobMarkdown storage={storage ?? undefined}>
              {streamingMessage.content}
            </BlobMarkdown>
          </Box>
        )}

        {streamingMessage.toolCalls.length > 0 && (
          <Box sx={{ mt: 1 }}>
            {streamingMessage.toolCalls.map((tc) => (
              <Chip
                key={tc.id}
                icon={tc.isComplete ? <Build /> : <CircularProgress size={14} />}
                label={tc.name}
                size="small"
                variant="outlined"
                sx={{ mr: 0.5, mb: 0.5 }}
              />
            ))}
          </Box>
        )}

        {!streamingMessage.content && streamingMessage.toolCalls.length === 0 && (
          <CircularProgress size={20} />
        )}
      </Paper>
    </Box>
  );
}