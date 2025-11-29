import axios from "axios";

import { authSelectors, useAuthStore } from "../store/auth";
import type { TokenResponse } from "../types";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "";

const client = axios.create({ baseURL });
const refreshClient = axios.create({ baseURL });

const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = authSelectors.getRefreshToken();
  if (!refreshToken) {
    return null;
  }
  try {
    const { data } = await refreshClient.post<TokenResponse>("/api/auth/refresh", {
      refresh_token: refreshToken,
    });
    const expiresAt = Date.now() + data.expires_in * 1000;
    useAuthStore.getState().setSession({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    });
    return data.access_token;
  } catch (error) {
    useAuthStore.getState().clearSession();
    return null;
  }
};

let refreshPromise: Promise<string | null> | null = null;

client.interceptors.request.use((config) => {
  const token = authSelectors.getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;
    if (status === 401 && originalRequest && !originalRequest._retry) {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken && originalRequest) {
        originalRequest._retry = true;
        originalRequest.headers = originalRequest.headers ?? {};
        (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        return client.request(originalRequest);
      }
    }
    if (status === 401 || status === 403) {
      useAuthStore.getState().clearSession();
    }
    return Promise.reject(error);
  },
);

export default client;
