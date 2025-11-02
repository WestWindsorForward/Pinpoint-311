import { create } from "zustand";

import { apiClient, setAuthToken } from "../api/client";
import { LoginResponse, StaffUser } from "../api/types";

interface AuthState {
  token: string | null;
  user: StaffUser | null;
  login: (email: string, password: string) => Promise<void>;
  fetchUser: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem("staff_token"),
  user: null,
  async login(email: string, password: string) {
    const formData = new FormData();
    formData.append("username", email);
    formData.append("password", password);
    const { data } = await apiClient.post<LoginResponse>('/staff/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    setAuthToken(data.access_token);
    set({ token: data.access_token });
    await get().fetchUser();
  },
  async fetchUser() {
    try {
      const { data } = await apiClient.get<StaffUser>('/staff/auth/me');
      set({ user: data });
    } catch (err) {
      setAuthToken(null);
      set({ token: null, user: null });
    }
  },
  logout() {
    setAuthToken(null);
    set({ token: null, user: null });
  }
}));
