/**
 * AWP Agent - Main Application
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
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
  SwipeableDrawer,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Settings,
  Extension,
  Link as LinkIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { theme } from './theme';
import {
  EndpointManager,
  SkillSidebar,
  ChatPanel,
  ConversationList,
  ModelManager,
  ModelSelector,
} from './components';
import { useModelConfig, useAwpManager, useConversations, useAgent } from './hooks';
import { StorageContextProvider } from './contexts/StorageContext';
import type { Message } from './storage';

const LEFT_DRAWER_WIDTH = 280;
const RIGHT_DRAWER_WIDTH = 380;
const MOBILE_DRAWER_WIDTH = '85vw';

type RightTab = 'models' | 'skills' | 'endpoints';

export function App() {
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('models');

  // On desktop, open drawers by default
  useEffect(() => {
    if (!isMobile) {
      setLeftDrawerOpen(true);
      setRightDrawerOpen(true);
    }
  }, [isMobile]);

  // Hooks
  const {
    endpoints: modelEndpoints,
    models,
    selectedModel,
    adapter,
    isConfigured,
    addEndpoint: addModelEndpoint,
    updateEndpoint: updateModelEndpoint,
    deleteEndpoint: deleteModelEndpoint,
    addModel,
    updateModel,
    deleteModel,
    selectModel,
  } = useModelConfig();
  const {
    manager,
    endpoints,
    skills,
    isLoading: endpointsLoading,
    registerEndpoint,
    updateEndpoint,
    unregisterEndpoint,
    refresh,
  } = useAwpManager();
  const {
    conversations,
    currentConversation,
    createConversation,
    loadConversation,
    deleteConversation,
    addMessage,
  } = useConversations();

  // Use ref to avoid stale closures in handleMessageAdded
  const currentConversationRef = useRef(currentConversation);
  currentConversationRef.current = currentConversation;
  const addMessageRef = useRef(addMessage);
  addMessageRef.current = addMessage;

  // Handle message persistence callback - uses refs to avoid recreating on every render
  const handleMessageAdded = useCallback(async (message: Message) => {
    if (currentConversationRef.current) {
      try {
        await addMessageRef.current(message);
      } catch (err) {
        console.error("Failed to persist message:", err);
      }
    }
  }, []);

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
    loadMessages,
    stop,
    error,
  } = useAgent({ manager, adapter, onMessageAdded: handleMessageAdded });

  const handleNewConversation = async () => {
    await createConversation();
    clearConversation();
  };

  const handleSelectConversation = async (id: string) => {
    const conversation = await loadConversation(id);
    if (conversation) {
      loadMessages(conversation.messages);
    }
  };

  // Drawer content for left side
  const leftDrawerContent = (
    <>
      {isMobile && (
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6">Conversations</Typography>
          <IconButton onClick={() => setLeftDrawerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Toolbar>
      )}
      {!isMobile && <Toolbar />}
      <ConversationList
        conversations={conversations}
        currentId={currentConversation?.id ?? null}
        onSelect={(id) => {
          handleSelectConversation(id);
          if (isMobile) setLeftDrawerOpen(false);
        }}
        onCreate={async () => {
          await handleNewConversation();
          if (isMobile) setLeftDrawerOpen(false);
        }}
        onDelete={deleteConversation}
      />
    </>
  );

  // Drawer content for right side
  const rightDrawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {isMobile && (
        <Toolbar sx={{ justifyContent: 'space-between', flexShrink: 0 }}>
          <Typography variant="h6">Settings</Typography>
          <IconButton onClick={() => setRightDrawerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Toolbar>
      )}
      {!isMobile && <Toolbar />}
      <Tabs
        value={rightTab}
        onChange={(_, value) => setRightTab(value)}
        variant="fullWidth"
        sx={{ flexShrink: 0 }}
      >
        <Tab icon={<Settings />} label="Models" value="models" sx={{ minWidth: 0, px: 1 }} />
        <Tab icon={<Extension />} label="Skills" value="skills" sx={{ minWidth: 0, px: 1 }} />
        <Tab icon={<LinkIcon />} label="AWP" value="endpoints" sx={{ minWidth: 0, px: 1 }} />
      </Tabs>
      <Divider />

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {rightTab === 'models' && (
          <ModelManager
            endpoints={modelEndpoints}
            models={models}
            onAddEndpoint={addModelEndpoint}
            onUpdateEndpoint={updateModelEndpoint}
            onDeleteEndpoint={deleteModelEndpoint}
            onAddModel={addModel}
            onUpdateModel={updateModel}
            onDeleteModel={deleteModel}
          />
        )}

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
              onUpdate={updateEndpoint}
              onUnregister={unregisterEndpoint}
              onRefresh={refresh}
            />
          </Box>
        )}
      </Box>
    </Box>
  );

  const drawerWidth = isMobile ? MOBILE_DRAWER_WIDTH : LEFT_DRAWER_WIDTH;
  const rightDrawerWidth = isMobile ? MOBILE_DRAWER_WIDTH : RIGHT_DRAWER_WIDTH;

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
          <Toolbar sx={{ px: { xs: 1, sm: 2 } }}>
            <IconButton
              edge="start"
              onClick={() => setLeftDrawerOpen(!leftDrawerOpen)}
              sx={{ mr: { xs: 1, sm: 2 } }}
            >
              <MenuIcon />
            </IconButton>

            <Typography 
              variant="h6" 
              component="div" 
              sx={{ 
                flexGrow: 1,
                fontSize: { xs: '1rem', sm: '1.25rem' },
              }}
            >
              AWP Agent
            </Typography>

            {/* Model selector */}
            <ModelSelector
              models={models}
              selectedModel={selectedModel}
              onSelectModel={selectModel}
              onOpenSettings={() => {
                setRightTab('models');
                setRightDrawerOpen(true);
              }}
              size="small"
            />

            {endpoints.length > 0 && !isMobile && (
              <Chip
                label={`${endpoints.length} AWP`}
                size="small"
                variant="outlined"
                sx={{ ml: 1, cursor: 'pointer' }}
                onClick={() => {
                  setRightTab('endpoints');
                  setRightDrawerOpen(true);
                }}
              />
            )}

            <IconButton 
              onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
              title="Settings"
            >
              <Settings />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Left Drawer - Conversations */}
        {isMobile ? (
          <SwipeableDrawer
            anchor="left"
            open={leftDrawerOpen}
            onClose={() => setLeftDrawerOpen(false)}
            onOpen={() => setLeftDrawerOpen(true)}
            sx={{
              '& .MuiDrawer-paper': {
                width: drawerWidth,
                boxSizing: 'border-box',
              },
            }}
            disableBackdropTransition
          >
            {leftDrawerContent}
          </SwipeableDrawer>
        ) : (
          <Drawer
            variant="temporary"
            anchor="left"
            open={leftDrawerOpen}
            onClose={() => setLeftDrawerOpen(false)}
            ModalProps={{
              keepMounted: true, // Better open performance on desktop
            }}
            sx={{
              '& .MuiDrawer-paper': {
                width: LEFT_DRAWER_WIDTH,
                boxSizing: 'border-box',
              },
            }}
          >
            {leftDrawerContent}
          </Drawer>
        )}

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0, // Prevent flex item from overflowing
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
                p: { xs: 2, sm: 4 },
              }}
            >
              <Settings sx={{ fontSize: { xs: 48, sm: 64 }, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h5" gutterBottom sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                Configure a Model
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3, textAlign: 'center', px: 2 }}>
                Add an endpoint and model to start using the agent.
              </Typography>
              <Button
                variant="contained"
                size="large"
                onClick={() => {
                  setRightTab('models');
                  setRightDrawerOpen(true);
                }}
              >
                Add Model
              </Button>
            </Box>
          )}

          {/* Chat state */}
          {isConfigured && (
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
        {isMobile ? (
          <SwipeableDrawer
            anchor="right"
            open={rightDrawerOpen}
            onClose={() => setRightDrawerOpen(false)}
            onOpen={() => setRightDrawerOpen(true)}
            sx={{
              '& .MuiDrawer-paper': {
                width: rightDrawerWidth,
                boxSizing: 'border-box',
              },
            }}
            disableBackdropTransition
          >
            {rightDrawerContent}
          </SwipeableDrawer>
        ) : (
          <Drawer
            variant="temporary"
            anchor="right"
            open={rightDrawerOpen}
            onClose={() => setRightDrawerOpen(false)}
            ModalProps={{
              keepMounted: true,
            }}
            sx={{
              '& .MuiDrawer-paper': {
                width: RIGHT_DRAWER_WIDTH,
                boxSizing: 'border-box',
              },
            }}
          >
            {rightDrawerContent}
          </Drawer>
        )}

      </Box>
      </StorageContextProvider>
    </ThemeProvider>
  );
}

export default App;
