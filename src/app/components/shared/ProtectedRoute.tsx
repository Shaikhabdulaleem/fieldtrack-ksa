import { Navigate } from "react-router";
import { getToken, getStoredUser } from "../../lib/api";

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
  loginPath?: string;
}

export function ProtectedRoute({ children, roles, loginPath = "/login" }: ProtectedRouteProps) {
  const token = getToken();
  const user = getStoredUser();

  if (!token || !user) {
    return <Navigate to={loginPath} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={loginPath} replace />;
  }

  return <>{children}</>;
}
