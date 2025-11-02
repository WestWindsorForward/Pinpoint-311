import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost/api";

export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: false
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("staff_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem("staff_token", token);
  } else {
    localStorage.removeItem("staff_token");
  }
}
