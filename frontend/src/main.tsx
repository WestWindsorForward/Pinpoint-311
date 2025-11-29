import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import App from "./App";
import { AuthBootstrapper } from "./components/AuthBootstrapper";
import { RequireRole } from "./components/RequireRole";
import { LoginPage } from "./pages/LoginPage";
import AdminLayout from "./layouts/AdminLayout";
import { BrandingPage } from "./pages/admin/Branding";
import { OverviewPage } from "./pages/admin/Overview";
import { StubPage } from "./pages/admin/Stub";
import { ResidentPortal } from "./pages/ResidentPortal";
import { StaffCommandCenter } from "./pages/StaffCommandCenter";
import { ChangePasswordPage } from "./pages/ChangePassword";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <ResidentPortal /> },
      { path: "login", element: <LoginPage /> },
      {
        path: "change-password",
        element: (
          <RequireRole roles={["resident", "staff", "admin"]}>
            <ChangePasswordPage />
          </RequireRole>
        ),
      },
      {
        path: "admin",
        element: (
          <RequireRole roles={["admin"]}>
            <AdminLayout />
          </RequireRole>
        ),
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "overview", element: <OverviewPage /> },
          { path: "branding", element: <BrandingPage /> },
          { path: "departments", element: <StubPage title="Departments" to="/admin" /> },
          { path: "categories", element: <StubPage title="Categories" to="/admin" /> },
          { path: "boundaries", element: <StubPage title="Boundaries" to="/admin" /> },
          { path: "staff", element: <StubPage title="Staff" to="/admin" /> },
          { path: "requests", element: <StubPage title="Requests" to="/admin" /> },
          { path: "runtime", element: <StubPage title="Runtime Config" to="/admin" /> },
          { path: "secrets", element: <StubPage title="Secrets" to="/admin" /> },
          { path: "system", element: <StubPage title="System" to="/admin" /> },
        ],
      },
      {
        path: "staff",
        element: (
          <RequireRole roles={["admin", "staff"]}>
            <StaffCommandCenter />
          </RequireRole>
        ),
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthBootstrapper>
        <RouterProvider router={router} />
      </AuthBootstrapper>
    </QueryClientProvider>
  </StrictMode>,
);
