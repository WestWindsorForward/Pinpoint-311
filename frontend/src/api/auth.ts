import client from "./client";
import type { AuthUser, TokenResponse } from "../types";

export type LoginPayload = {
  email: string;
  password: string;
};

export const login = async (payload: LoginPayload) => {
  const formData = new URLSearchParams();
  formData.append("username", payload.email);
  formData.append("password", payload.password);
  const { data } = await client.post<TokenResponse>("/api/auth/login", formData, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data;
};

export const refreshSession = async (refreshToken: string) => {
  const { data } = await client.post<TokenResponse>("/api/auth/refresh", { refresh_token: refreshToken });
  return data;
};

export const fetchCurrentUser = async () => {
  const { data } = await client.get<AuthUser>("/api/auth/me");
  return data;
};

export const logoutSession = async (refreshToken: string) => {
  await client.post("/api/auth/logout", { refresh_token: refreshToken });
};

export const changePassword = async (payload: { current_password: string; new_password: string }) => {
  await client.post("/api/auth/change-password", payload);
};
