import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import App from "./App";
import ErrorFallback from "./components/ErrorFallback";
import { AuthBootstrapper } from "./components/AuthBootstrapper";
import { RequireRole } from "./components/RequireRole";
import { LoginPage } from "./pages/LoginPage";
import AdminLayout from "./layouts/AdminLayout";
const BrandingPage = lazy(() => import("./pages/admin/Branding").then(m => ({ default: m.BrandingPage })));
const OverviewPage = lazy(() => import("./pages/admin/Overview").then(m => ({ default: m.OverviewPage })));
const DepartmentsPage = lazy(() => import("./pages/admin/Departments").then(m => ({ default: m.DepartmentsPage })));
const CategoriesPage = lazy(() => import("./pages/admin/Categories").then(m => ({ default: m.CategoriesPage })));
const BoundariesPage = lazy(() => import("./pages/admin/Boundaries").then(m => ({ default: m.BoundariesPage })));
const StaffPage = lazy(() => import("./pages/admin/Staff").then(m => ({ default: m.StaffPage })));
const RequestsPage = lazy(() => import("./pages/admin/Requests").then(m => ({ default: m.RequestsPage })));
const RuntimeConfigPage = lazy(() => import("./pages/admin/RuntimeConfig").then(m => ({ default: m.RuntimeConfigPage })));
const SecretsPage = lazy(() => import("./pages/admin/Secrets").then(m => ({ default: m.SecretsPage })));
const SystemPage = lazy(() => import("./pages/admin/System").then(m => ({ default: m.SystemPage })));
const ResidentPortal = lazy(() => import("./pages/ResidentPortal").then(m => ({ default: m.ResidentPortal })));
const StaffCommandCenter = lazy(() => import("./pages/StaffCommandCenter").then(m => ({ default: m.StaffCommandCenter })));
import { ChangePasswordPage } from "./pages/ChangePassword";
import { ForgotPasswordRequestPage } from "./pages/ForgotPasswordRequest";
import { ResetPasswordPage } from "./pages/ResetPassword";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 120_000,
      gcTime: 600_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <ErrorFallback />,
    children: [
      { index: true, element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <ResidentPortal /> </Suspense> },
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
        errorElement: <ErrorFallback />,
        children: [
          { index: true, element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <OverviewPage /> </Suspense> },
          { path: "overview", element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <OverviewPage /> </Suspense> },
          { path: "branding", element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <BrandingPage /> </Suspense> },
          { path: "departments", element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <DepartmentsPage /> </Suspense> },
          { path: "categories", element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <CategoriesPage /> </Suspense> },
          { path: "boundaries", element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <BoundariesPage /> </Suspense> },
          { path: "staff", element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <StaffPage /> </Suspense> },
          { path: "requests", element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <RequestsPage /> </Suspense> },
          { path: "runtime", element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <RuntimeConfigPage /> </Suspense> },
          { path: "secrets", element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <SecretsPage /> </Suspense> },
          { path: "system", element: <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <SystemPage /> </Suspense> },
        ],
      },
      {
        path: "staff",
        element: (
          <RequireRole roles={["admin", "staff"]}>
            <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-100" />}> <StaffCommandCenter /> </Suspense>
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
