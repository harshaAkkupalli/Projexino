import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = guest, object = user
  const [error, setError] = useState("");

  const fetchMe = useCallback(async () => {
    const hasToken = localStorage.getItem("pj_token");
    if (!hasToken) {
      // Skip noisy 401 probe for public pages — assume guest
      setUser(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      if (data.token) localStorage.setItem("pj_token", data.token);
      if (data.role) localStorage.setItem("pj_role", JSON.stringify(data.role));
      setUser(data);
      return true;
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || e.message);
      return false;
    }
  };

  const register = async (name, email, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      // auto-login
      const ok = await login(email, password);
      return ok || !!data;
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || e.message);
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("pj_token");
    localStorage.removeItem("pj_role");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, error, refresh: fetchMe, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
