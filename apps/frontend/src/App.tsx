import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useTownshipConfig } from "./hooks/useTownshipConfig";
import { useAuthStore } from "./store/auth";
import ResidentLanding from "./pages/ResidentLanding";
import ResidentRequestForm from "./pages/ResidentRequestForm";
import RequestTracking from "./pages/RequestTracking";
import StaffLogin from "./pages/staff/StaffLogin";
import StaffDashboard from "./pages/staff/StaffDashboard";
import StaffRequestList from "./pages/staff/RequestList";
import StaffRequestDetail from "./pages/staff/RequestDetail";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const token = useAuthStore((state) => state.token);
  if (!token) {
    return <Navigate to="/staff/login" replace />;
  }
  return children;
}

function App() {
  const { config, loading } = useTownshipConfig();
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const token = useAuthStore((state) => state.token);
  const location = useLocation();

  useEffect(() => {
    if (token) {
      void fetchUser();
    }
  }, [token, fetchUser]);

  useEffect(() => {
    if (!config) return;
    const primary = config.township.primary_color;
    document.documentElement.style.setProperty("--primary-color", primary);
  }, [config]);

  if (loading || !config) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div className="card">Loading township portal...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<ResidentLanding config={config} />} />
      <Route path="/requests/new" element={<ResidentRequestForm config={config} />} />
      <Route path="/track" element={<RequestTracking />} />

      <Route path="/staff/login" element={<StaffLogin />} />
      <Route
        path="/staff/dashboard"
        element={
          <ProtectedRoute>
            <StaffDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/requests"
        element={
          <ProtectedRoute>
            <StaffRequestList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/requests/:id"
        element={
          <ProtectedRoute>
            <StaffRequestDetail />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
