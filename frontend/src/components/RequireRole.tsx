import { Navigate, useLocation } from "react-router-dom";

import { useAuthStore } from "../store/auth";
import type { UserRole } from "../types";

interface Props {
  roles: UserRole[];
  children: React.ReactNode;
}

export function RequireRole({ roles, children }: Props) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.must_reset_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" state={{ from: location }} replace />;
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
