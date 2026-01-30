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
  Typography,
  CircularProgress,
  Chip,
  Collapse,
  Switch,
  FormControlLabel,
  useMediaQuery,
  useTheme,
  keyframes,
} from '@mui/material';
import { Send, Stop, ExpandMore, ExpandLess, Build, Code } from '@mui/icons-material';

// Rainbow gradient animation for processing state
const rainbowMove = keyframes`
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
`;
import type { Message, ModelWithEndpoint } from '../storage';
import type { AgentState, StreamingMessage } from '../hooks/useAgent';
import { BlobMarkdown } from './BlobMarkdown';
import { ModelSelector } from './ModelSelector';
import { useStorage } from '../contexts/StorageContext';

export interface ChatPanelProps {
  messages: Message[];
  streamingMessage: StreamingMessage | null;
  state: AgentState;
  error: string | null;
  onSendMessage: (content: string) => Promise<void>;
  onStop: () => void;
  // Model selector props
  models: ModelWithEndpoint[];
  selectedModel: ModelWithEndpoint | null;
  onSelectModel: (modelId: string) => Promise<void>;
  onOpenModelSettings?: () => void;
}

export function ChatPanel({
  messages,
  streamingMessage,
  state,
  error,
  onSendMessage,
  onStop,
  models,
  selectedModel,
  onSelectModel,
  onOpenModelSettings,
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
    if (!content || state !== 'idle' || !hasModel) return;

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
  const hasModel = selectedModel !== null;
  const canSend = hasModel && input.trim() && !isProcessing;

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      flex: 1,
      minHeight: 0, // Critical for flex child to respect overflow
      overflow: 'hidden',
      bgcolor: 'background.paper',
    }}>
      {/* Messages - scrollable area */}
      <Box sx={{ 
        flex: 1, 
        overflow: 'auto', 
        minHeight: 0,
        p: { xs: 1, sm: 2 },
      }}>
            {messages.length === 0 && !streamingMessage && (
              <Box
                sx={{
                  height: 200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 2,
                }}
              >
                <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
                  {hasModel 
                    ? 'Start a conversation or load a skill to begin.'
                    : 'Select a model to start chatting.'}
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
              <Box sx={{ p: 2, bgcolor: 'error.light', color: 'error.contrastText', mb: 2, borderRadius: 1 }}>
                <Typography variant="body2">{error}</Typography>
              </Box>
            )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box sx={{ 
        borderTop: 1, 
        borderColor: 'divider',
        flexShrink: 0,
        p: { xs: 1.5, sm: 2 },
        position: 'relative',
        bgcolor: 'background.paper',
      }}>
        {/* Rainbow gradient overlay when processing */}
        {isProcessing && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, rgba(255,0,0,0.1), rgba(255,165,0,0.1), rgba(255,255,0,0.1), rgba(0,128,0,0.1), rgba(0,0,255,0.1), rgba(75,0,130,0.1), rgba(238,130,238,0.1), rgba(255,0,0,0.1))',
              backgroundSize: '200% 100%',
              animation: `${rainbowMove} 3s ease infinite`,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}
        {/* Model selector - above input, left aligned */}
        <Box sx={{ mb: 1 }}>
          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            onSelectModel={onSelectModel}
            onOpenSettings={onOpenModelSettings}
            size="small"
            disabled={isProcessing}
          />
        </Box>
        
        {/* Input row */}
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
                bgcolor: 'background.paper',
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
              disabled={!canSend}
              size={isMobile ? 'medium' : 'large'}
            >
              <Send />
            </IconButton>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Message Component
 */
function MessageBubble({ message }: { message: Message; isMobile?: boolean }) {
  const [toolExpanded, setToolExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const storage = useStorage();

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  // Don't show tool messages, they're shown inline with the tool call
  if (isTool) {
    return null;
  }

  return (
    <Box
      sx={{
        mb: 2,
        pb: 2,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* Role label */}
      <Typography 
        variant="caption" 
        sx={{ 
          fontWeight: 'bold',
          color: isUser ? 'primary.main' : 'text.secondary',
          mb: 0.5,
          display: 'block',
        }}
      >
        {isUser ? 'You' : 'Assistant'}
      </Typography>

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
              bgcolor: 'grey.100',
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
              overflow: 'hidden',
              wordBreak: 'break-word',
              '& code': {
                bgcolor: 'grey.100',
                px: 0.5,
                borderRadius: 0.5,
                fontFamily: 'monospace',
                wordBreak: 'break-all',
              },
              '& pre': {
                bgcolor: 'grey.100',
                p: 1,
                borderRadius: 1,
                overflow: 'auto',
                maxWidth: '100%',
              },
              '& img': {
                maxWidth: '100%',
                borderRadius: 1,
                mt: 1,
              },
              '& table': {
                maxWidth: '100%',
                overflow: 'auto',
                display: 'block',
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
            <Build fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {message.toolCalls.length} tool call{message.toolCalls.length > 1 ? 's' : ''}
            </Typography>
            {toolExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </Box>

          <Collapse in={toolExpanded}>
            <Box sx={{ mt: 1 }}>
              {message.toolCalls.map((tc) => (
                <Box
                  key={tc.id}
                  sx={{
                    p: 1,
                    mb: 1,
                    bgcolor: 'grey.50',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="caption" fontWeight="medium">
                    {tc.name}
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      mt: 0.5,
                      mb: 0,
                      p: 1,
                      bgcolor: 'grey.100',
                      borderRadius: 1,
                      fontSize: '0.75rem',
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(tc.arguments, null, 2)}
                  </Box>
                </Box>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}
/**
 * Streaming Message Component
 */
function StreamingMessageBubble({ streamingMessage }: { streamingMessage: StreamingMessage; isMobile?: boolean }) {
  const storage = useStorage();

  return (
    <Box sx={{ mb: 2 }}>
      {/* Role label */}
      <Typography 
        variant="caption" 
        sx={{ 
          fontWeight: 'bold',
          color: 'text.secondary',
          mb: 0.5,
          display: 'block',
        }}
      >
        Assistant
      </Typography>

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
        <Typography variant="body2" color="text.secondary">...</Typography>
      )}
    </Box>
  );
}