import { Routes, Route, Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Clients from "./pages/Clients";
import Nodes from "./pages/Nodes";
import Tokens from "./pages/Tokens";
import Tickets from "./pages/Tickets";
import AwpAuth from "./pages/AwpAuth";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    const returnUrl = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/awp" element={<AwpAuth />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="agents" element={<Clients />} />
          <Route path="nodes" element={<Nodes />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="tickets" element={<Tickets />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Box>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
