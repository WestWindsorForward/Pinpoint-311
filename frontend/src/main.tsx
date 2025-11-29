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
import { DepartmentsPage } from "./pages/admin/Departments";
import { CategoriesPage } from "./pages/admin/Categories";
import { BoundariesPage } from "./pages/admin/Boundaries";
import { StaffPage } from "./pages/admin/Staff";
import { RequestsPage } from "./pages/admin/Requests";
import { RuntimeConfigPage } from "./pages/admin/RuntimeConfig";
import { SecretsPage } from "./pages/admin/Secrets";
import { SystemPage } from "./pages/admin/System";
import { ResidentPortal } from "./pages/ResidentPortal";
import { StaffCommandCenter } from "./pages/StaffCommandCenter";
import { ChangePasswordPage } from "./pages/ChangePassword";
import { ForgotPasswordRequestPage } from "./pages/ForgotPasswordRequest";
import { ResetPasswordPage } from "./pages/ResetPassword";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <ResidentPortal /> },
      { path: "login", element: <LoginPage /> },
      { path: "forgot", element: <ForgotPasswordRequestPage /> },
      { path: "reset", element: <ResetPasswordPage /> },
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
          { path: "departments", element: <DepartmentsPage /> },
          { path: "categories", element: <CategoriesPage /> },
          { path: "boundaries", element: <BoundariesPage /> },
          { path: "staff", element: <StaffPage /> },
          { path: "requests", element: <RequestsPage /> },
          { path: "runtime", element: <RuntimeConfigPage /> },
          { path: "secrets", element: <SecretsPage /> },
          { path: "system", element: <SystemPage /> },
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
