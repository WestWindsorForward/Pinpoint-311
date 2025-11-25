import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import App from "./App";
import { AuthBootstrapper } from "./components/AuthBootstrapper";
import { RequireRole } from "./components/RequireRole";
import { LoginPage } from "./pages/LoginPage";
import { AdminConsole } from "./pages/AdminConsole";
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
            <AdminConsole />
          </RequireRole>
        ),
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
