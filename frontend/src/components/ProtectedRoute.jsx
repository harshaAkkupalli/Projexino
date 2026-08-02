import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Loader from "./Loader";

export default function ProtectedRoute({ children, allowedRoles, internOnly }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === null) return <Loader />;
  if (user === false) return <Navigate to="/login" replace />;

  // Legacy `internOnly` flag: interns now share the same /app/* portal as
  // everyone else, so this guard simply forwards them to /app/dashboard.
  if (internOnly && user.role !== "intern") {
    return <Navigate to="/app/dashboard" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/app/dashboard" replace />;
  }
  // Keep location reference so router re-evaluates when path changes.
  void location;
  return children;
}
