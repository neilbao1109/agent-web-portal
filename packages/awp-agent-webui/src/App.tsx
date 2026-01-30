/**
 * AWP Agent - Main Application (CAS Version)
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Tabs,
  Tab,
  Divider,
  Chip,
  SwipeableDrawer,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Settings,
  Extension,
  Link as LinkIcon,
  Close as CloseIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import { theme } from './theme';
import {
  EndpointManager,
  SkillSidebar,
  ChatPanel,
  ConversationList,
  ModelManager,
  CasConfigManager,
} from './components';
import { useModelConfig, useAwpManager, useConversations, useAgent } from './hooks';
import { StorageContextProvider } from './contexts/StorageContext';
import type { Message } from './storage';

const LEFT_DRAWER_WIDTH = 280;
const RIGHT_DRAWER_WIDTH = 380;
const MOBILE_DRAWER_WIDTH = '85vw';

type RightTab = 'models' | 'skills' | 'cas' | 'endpoints';

export function App() {
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('cas');

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
    keyStorage,
    clientName,
    endpoints,
    skills,
    isLoading: endpointsLoading,
    casEndpoint,
    isCasAuthenticated,
    setCasEndpoint,
    setCasAuthenticated,
    registerEndpoint,
    updateEndpoint,
    unregisterEndpoint,
    refresh,
    defaultCasEndpoint,
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
        <Tab icon={<Settings />} label="Models" value="models" sx={{ minWidth: 0, px: 0.5, fontSize: '0.7rem' }} />
        <Tab icon={<StorageIcon />} label="CAS" value="cas" sx={{ minWidth: 0, px: 0.5, fontSize: '0.7rem' }} />
        <Tab icon={<LinkIcon />} label="AWP" value="endpoints" sx={{ minWidth: 0, px: 0.5, fontSize: '0.7rem' }} />
        <Tab icon={<Extension />} label="Skills" value="skills" sx={{ minWidth: 0, px: 0.5, fontSize: '0.7rem' }} />
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

        {rightTab === 'cas' && (
          <Box sx={{ p: 2 }}>
            <CasConfigManager
              casEndpoint={casEndpoint}
              onCasEndpointChange={setCasEndpoint}
              keyStorage={keyStorage}
              clientName={clientName}
              onAuthStatusChange={setCasAuthenticated}
            />
          </Box>
        )}

        {rightTab === 'endpoints' && (
          <Box sx={{ p: 2 }}>
            {!isCasAuthenticated && (
              <Box sx={{ mb: 2 }}>
                <Chip
                  icon={<StorageIcon />}
                  label="CAS not authorized"
                  color="warning"
                  size="small"
                  onClick={() => setRightTab('cas')}
                  sx={{ cursor: 'pointer' }}
                />
              </Box>
            )}
            <EndpointManager
              endpoints={endpoints}
              isLoading={endpointsLoading}
              defaultCasEndpoint={defaultCasEndpoint}
              onRegister={registerEndpoint}
              onUpdate={updateEndpoint}
              onUnregister={unregisterEndpoint}
              onRefresh={refresh}
            />
          </Box>
        )}

        {rightTab === 'skills' && (
          <SkillSidebar
            availableSkills={availableSkills.length > 0 ? availableSkills : skills}
            activeSkillIds={activeSkillIds}
            onLoadSkill={loadSkill}
            onUnloadSkill={unloadSkill}
          />
        )}
      </Box>
    </Box>
  );

  const drawerWidth = isMobile ? MOBILE_DRAWER_WIDTH : LEFT_DRAWER_WIDTH;
  const rightDrawerWidth = isMobile ? MOBILE_DRAWER_WIDTH : RIGHT_DRAWER_WIDTH;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <StorageContextProvider baseUrl={casEndpoint}>
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
              AWP Agent (CAS)
            </Typography>

            {/* CAS status indicator */}
            <Chip
              icon={<StorageIcon fontSize="small" />}
              label={isCasAuthenticated ? 'CAS' : 'CAS'}
              size="small"
              variant="outlined"
              color={isCasAuthenticated ? 'success' : 'warning'}
              sx={{ ml: 1, cursor: 'pointer' }}
              onClick={() => {
                setRightTab('cas');
                setRightDrawerOpen(true);
              }}
            />

            {skills.length > 0 && !isMobile && (
              <Chip
                icon={<Extension fontSize="small" />}
                label={`${activeSkillIds.length}/${skills.length}`}
                size="small"
                variant="outlined"
                color={activeSkillIds.length > 0 ? 'primary' : 'default'}
                sx={{ ml: 1, cursor: 'pointer' }}
                onClick={() => {
                  setRightTab('skills');
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
          <Box
            sx={{
              width: leftDrawerOpen ? LEFT_DRAWER_WIDTH : 0,
              flexShrink: 0,
              overflow: 'hidden',
              transition: (theme) =>
                theme.transitions.create('width', {
                  easing: theme.transitions.easing.easeOut,
                  duration: theme.transitions.duration.enteringScreen,
                }),
              borderRight: leftDrawerOpen ? 1 : 0,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ width: LEFT_DRAWER_WIDTH }}>
              {leftDrawerContent}
            </Box>
          </Box>
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
          }}
        >
          <Toolbar />

          {/* Chat panel - always visible */}
          <ChatPanel
            messages={messages}
            streamingMessage={streamingMessage}
            state={state}
            error={error}
            onSendMessage={sendMessage}
            onStop={stop}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={selectModel}
            onOpenModelSettings={() => {
              setRightTab('models');
              setRightDrawerOpen(true);
            }}
          />
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
          <Box
            sx={{
              width: rightDrawerOpen ? RIGHT_DRAWER_WIDTH : 0,
              flexShrink: 0,
              overflow: 'hidden',
              transition: (theme) =>
                theme.transitions.create('width', {
                  easing: theme.transitions.easing.easeOut,
                  duration: theme.transitions.duration.enteringScreen,
                }),
              borderLeft: rightDrawerOpen ? 1 : 0,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ width: RIGHT_DRAWER_WIDTH }}>
              {rightDrawerContent}
            </Box>
          </Box>
        )}

      </Box>
      </StorageContextProvider>
    </ThemeProvider>
  );
}

export default App;
