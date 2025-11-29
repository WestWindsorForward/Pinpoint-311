import { create } from "zustand";

import type { AuthUser } from "../types";

const STORAGE_KEY = "trms.auth";

type TokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

interface AuthState {
  user?: AuthUser;
  tokens?: TokenBundle;
  hydrate: () => void;
  setSession: (tokens: TokenBundle) => void;
  setUser: (user: AuthUser) => void;
  clearSession: () => void;
}

const readStorage = (): Partial<AuthState> => {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { user?: AuthUser; tokens?: TokenBundle };
    return parsed;
  } catch (error) {
    console.warn("Failed to parse stored auth session", error);
    window.localStorage.removeItem(STORAGE_KEY);
    return {};
  }
};

const writeStorage = (data: Partial<AuthState>) => {
  if (typeof window === "undefined") return;
  if (!data.user && !data.tokens) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user: data.user, tokens: data.tokens })
    );
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: undefined,
  tokens: undefined,
  hydrate: () => {
    const persisted = readStorage();
    if (!persisted.tokens || !persisted.tokens.expiresAt || persisted.tokens.expiresAt < Date.now()) {
      set({ user: undefined, tokens: undefined });
      writeStorage({});
      return;
    }
    if (persisted.user || persisted.tokens) {
      set(persisted);
    }
  },
  setSession: (tokens) => {
    set({ tokens });
    writeStorage({ tokens, user: get().user });
  },
  setUser: (user) => {
    set({ user });
    writeStorage({ tokens: get().tokens, user });
  },
  clearSession: () => {
    set({ user: undefined, tokens: undefined });
    writeStorage({});
  },
}));

export const authSelectors = {
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken,
  getRefreshToken: () => useAuthStore.getState().tokens?.refreshToken,
};
