/**
 * AWP Agent - Main Application
 */

import { useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Tabs,
  Tab,
  Divider,
  Button,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Settings,
  Extension,
  Link as LinkIcon,
} from '@mui/icons-material';
import { theme } from './theme';
import {
  LlmConfigDialog,
  EndpointManager,
  SkillSidebar,
  ChatPanel,
  ConversationList,
} from './components';
import { useLlmConfig, useAwpManager, useConversations, useAgent } from './hooks';
import { StorageContextProvider } from './contexts/StorageContext';

const LEFT_DRAWER_WIDTH = 280;
const RIGHT_DRAWER_WIDTH = 300;

type RightTab = 'skills' | 'endpoints';

export function App() {
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(true);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>('skills');
  const [llmConfigOpen, setLlmConfigOpen] = useState(false);

  // Hooks
  const { config, isConfigured, adapter, saveConfig } = useLlmConfig();
  const {
    manager,
    endpoints,
    skills,
    isLoading: endpointsLoading,
    registerEndpoint,
    unregisterEndpoint,
    refresh,
  } = useAwpManager();
  const {
    conversations,
    currentConversation,
    createConversation,
    loadConversation,
    deleteConversation,
  } = useConversations();
  const {
    state,
    messages,
    streamingMessage,
    activeSkillIds,
    availableSkills,
    sendMessage,
    loadSkill,
    unloadSkill,
    clearConversation,
    stop,
    error,
  } = useAgent({ manager, adapter });

  const handleNewConversation = async () => {
    await createConversation();
    clearConversation();
  };

  const handleSelectConversation = async (id: string) => {
    await loadConversation(id);
    // TODO: Restore conversation state to agent context
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <StorageContextProvider baseUrl="http://localhost:3400">
        <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* App Bar */}
        <AppBar
          position="fixed"
          sx={{
            zIndex: (theme) => theme.zIndex.drawer + 1,
            bgcolor: 'background.paper',
            color: 'text.primary',
            boxShadow: 'none',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Toolbar>
            <IconButton
              edge="start"
              onClick={() => setLeftDrawerOpen(!leftDrawerOpen)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>

            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              AWP Agent
            </Typography>

            {/* Status indicators */}
            {!isConfigured && (
              <Chip
                label="LLM not configured"
                color="warning"
                size="small"
                sx={{ mr: 1 }}
                onClick={() => setLlmConfigOpen(true)}
              />
            )}
            {isConfigured && config && (
              <Chip
                label={config.model}
                size="small"
                variant="outlined"
                sx={{ mr: 1 }}
              />
            )}
            {endpoints.length > 0 && (
              <Chip
                label={`${endpoints.length} endpoint${endpoints.length > 1 ? 's' : ''}`}
                size="small"
                variant="outlined"
                sx={{ mr: 1 }}
              />
            )}

            <IconButton onClick={() => setLlmConfigOpen(true)} title="Settings">
              <Settings />
            </IconButton>
            <IconButton onClick={() => setRightDrawerOpen(!rightDrawerOpen)}>
              <Extension />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Left Drawer - Conversations */}
        <Drawer
          variant="persistent"
          anchor="left"
          open={leftDrawerOpen}
          sx={{
            width: leftDrawerOpen ? LEFT_DRAWER_WIDTH : 0,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: LEFT_DRAWER_WIDTH,
              boxSizing: 'border-box',
            },
          }}
        >
          <Toolbar />
          <ConversationList
            conversations={conversations}
            currentId={currentConversation?.id ?? null}
            onSelect={handleSelectConversation}
            onCreate={handleNewConversation}
            onDelete={deleteConversation}
          />
        </Drawer>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            ml: leftDrawerOpen ? 0 : `-${LEFT_DRAWER_WIDTH}px`,
            mr: rightDrawerOpen ? 0 : `-${RIGHT_DRAWER_WIDTH}px`,
            transition: (theme) =>
              theme.transitions.create(['margin'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
          }}
        >
          <Toolbar />

          {/* Not configured state */}
          {!isConfigured && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 4,
              }}
            >
              <Settings sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Configure LLM
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
                Set up your LLM API connection to start using the agent.
              </Typography>
              <Button
                variant="contained"
                size="large"
                onClick={() => setLlmConfigOpen(true)}
              >
                Configure LLM
              </Button>
            </Box>
          )}

          {/* No endpoints state */}
          {isConfigured && endpoints.length === 0 && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 4,
              }}
            >
              <LinkIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Add an AWP Endpoint
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
                Connect to an AWP server to access skills and tools.
              </Typography>
              <Button
                variant="contained"
                size="large"
                onClick={() => {
                  setRightDrawerOpen(true);
                  setRightTab('endpoints');
                }}
              >
                Add Endpoint
              </Button>
            </Box>
          )}

          {/* Chat state */}
          {isConfigured && endpoints.length > 0 && (
            <ChatPanel
              messages={messages}
              streamingMessage={streamingMessage}
              state={state}
              error={error}
              onSendMessage={sendMessage}
              onStop={stop}
            />
          )}
        </Box>

        {/* Right Drawer - Skills & Endpoints */}
        <Drawer
          variant="persistent"
          anchor="right"
          open={rightDrawerOpen}
          sx={{
            width: rightDrawerOpen ? RIGHT_DRAWER_WIDTH : 0,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: RIGHT_DRAWER_WIDTH,
              boxSizing: 'border-box',
            },
          }}
        >
          <Toolbar />
          <Tabs
            value={rightTab}
            onChange={(_, value) => setRightTab(value)}
            variant="fullWidth"
          >
            <Tab icon={<Extension />} label="Skills" value="skills" />
            <Tab icon={<LinkIcon />} label="Endpoints" value="endpoints" />
          </Tabs>
          <Divider />

          {rightTab === 'skills' && (
            <SkillSidebar
              availableSkills={availableSkills.length > 0 ? availableSkills : skills}
              activeSkillIds={activeSkillIds}
              onLoadSkill={loadSkill}
              onUnloadSkill={unloadSkill}
            />
          )}

          {rightTab === 'endpoints' && (
            <Box sx={{ p: 2 }}>
              <EndpointManager
                endpoints={endpoints}
                isLoading={endpointsLoading}
                onRegister={registerEndpoint}
                onUnregister={unregisterEndpoint}
                onRefresh={refresh}
              />
            </Box>
          )}
        </Drawer>

        {/* LLM Config Dialog */}
        <LlmConfigDialog
          open={llmConfigOpen}
          onClose={() => setLlmConfigOpen(false)}
          onSave={saveConfig}
          currentConfig={config}
        />
      </Box>
      </StorageContextProvider>
    </ThemeProvider>
  );
}

export default App;
