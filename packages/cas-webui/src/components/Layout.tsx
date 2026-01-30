import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
  Avatar,
  Divider,
  alpha,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Devices as DevicesIcon,
  Hub as HubIcon,
  Logout as LogoutIcon,
  KeyboardArrowDown as ArrowDownIcon,
  Key as KeyIcon,
  ConfirmationNumber as TicketIcon,
} from "@mui/icons-material";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const DRAWER_WIDTH = 260;

const menuItems = [
  { path: "/", label: "Dashboard", icon: <DashboardIcon /> },
  { path: "/agents", label: "Clients", icon: <DevicesIcon /> },
  { path: "/nodes", label: "Nodes", icon: <HubIcon /> },
  { path: "/tokens", label: "Agent Tokens", icon: <KeyIcon /> },
  { path: "/tickets", label: "Tickets", icon: <TicketIcon /> },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(
    null
  );
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleLogout = async () => {
    handleUserMenuClose();
    await logout();
    navigate("/login");
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const drawerContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "#1a1f2e",
        color: "white",
      }}
    >
      {/* Brand Header */}
      <Box
        sx={{
          p: 3,
          pb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 14px rgba(102, 126, 234, 0.4)",
            }}
          >
            <HubIcon sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: "1.1rem",
                letterSpacing: "0.02em",
              }}
            >
              CAS Console
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "rgba(255,255,255,0.5)", fontSize: "0.7rem" }}
            >
              Agent Management
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Navigation */}
      <Box sx={{ px: 2, flexGrow: 1 }}>
        <Typography
          variant="overline"
          sx={{
            color: "rgba(255,255,255,0.4)",
            fontSize: "0.65rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            px: 1.5,
            mb: 1,
            display: "block",
          }}
        >
          Navigation
        </Typography>
        <List disablePadding>
          {menuItems.map((item) => {
            const isSelected = location.pathname === item.path;
            return (
              <ListItemButton
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                sx={{
                  mb: 0.5,
                  borderRadius: 2,
                  py: 1.25,
                  px: 1.5,
                  transition: "all 0.2s ease",
                  bgcolor: isSelected
                    ? "rgba(102, 126, 234, 0.2)"
                    : "transparent",
                  borderLeft: isSelected
                    ? "3px solid #667eea"
                    : "3px solid transparent",
                  "&:hover": {
                    bgcolor: isSelected
                      ? "rgba(102, 126, 234, 0.25)"
                      : "rgba(255,255,255,0.06)",
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 40,
                    color: isSelected ? "#667eea" : "rgba(255,255,255,0.6)",
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: "0.9rem",
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? "white" : "rgba(255,255,255,0.8)",
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      {/* User Section */}
      <Box sx={{ p: 2 }}>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", mb: 2 }} />
        <Box
          onClick={handleUserMenuOpen}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            cursor: "pointer",
            transition: "all 0.2s ease",
            "&:hover": {
              bgcolor: "rgba(255,255,255,0.06)",
            },
          }}
        >
          <Avatar
            sx={{
              width: 38,
              height: 38,
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              fontSize: "0.95rem",
              fontWeight: 600,
            }}
          >
            {user?.email?.[0]?.toUpperCase() || "U"}
          </Avatar>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                color: "white",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.email?.split("@")[0] || "User"}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.7rem",
              }}
            >
              Administrator
            </Typography>
          </Box>
          <ArrowDownIcon
            sx={{ color: "rgba(255,255,255,0.4)", fontSize: 18 }}
          />
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f5f7fa" }}>
      {/* Mobile AppBar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { md: "none" },
          bgcolor: "#1a1f2e",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: 1 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1.5,
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <HubIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1rem" }}>
              CAS Console
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: DRAWER_WIDTH,
            border: "none",
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            border: "none",
            boxShadow: "4px 0 24px rgba(0, 0, 0, 0.08)",
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* User Menu */}
      <Menu
        anchorEl={userMenuAnchor}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        open={Boolean(userMenuAnchor)}
        onClose={handleUserMenuClose}
        PaperProps={{
          sx: {
            minWidth: 200,
            mt: -1,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
            borderRadius: 2,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="body2" fontWeight={500}>
            {user?.email}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Administrator
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={handleLogout}
          sx={{
            py: 1.5,
            color: "error.main",
            "&:hover": {
              bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
            },
          }}
        >
          <ListItemIcon sx={{ color: "inherit" }}>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign Out
        </MenuItem>
      </Menu>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: "100vh",
          mt: { xs: 7, md: 0 },
          overflow: "auto",
        }}
      >
        <Box
          sx={{
            p: { xs: 2, sm: 3, md: 4 },
            maxWidth: 1600,
            mx: "auto",
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
