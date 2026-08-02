import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Attach Bearer token from localStorage (fallback for cookie issues)
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("pj_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export function formatApiError(input) {
  if (input == null) return "Something went wrong.";
  // If an axios error is passed directly, unwrap the backend `detail` first
  if (typeof input === "object" && input.isAxiosError) {
    const detail = input.response?.data?.detail;
    if (detail !== undefined) return formatApiError(detail);
    if (input.response?.data?.message) return String(input.response.data.message);
    if (input.message) return String(input.message);
    return "Request failed.";
  }
  const detail = input;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
