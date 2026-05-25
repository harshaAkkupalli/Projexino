import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Loader from "./Loader";

export default function ProtectedRoute({ children, allowedRoles, internOnly }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === null) return <Loader />;
  if (user === false) return <Navigate to="/login" replace />;

  // Intern restricted to /intern/*
  const isInternRoute = location.pathname.startsWith("/intern");
  if (user.role === "intern" && !isInternRoute) {
    return <Navigate to="/intern/dashboard" replace />;
  }
  if (internOnly && user.role !== "intern") {
    return <Navigate to="/app/dashboard" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return children;
}
