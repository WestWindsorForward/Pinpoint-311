import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import App from "./App";
import { AdminConsole } from "./pages/AdminConsole";
import { ResidentPortal } from "./pages/ResidentPortal";
import { StaffCommandCenter } from "./pages/StaffCommandCenter";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <ResidentPortal /> },
      { path: "admin", element: <AdminConsole /> },
      { path: "staff", element: <StaffCommandCenter /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
