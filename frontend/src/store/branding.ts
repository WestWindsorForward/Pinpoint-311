import { create } from "zustand";

import type { Branding } from "../types";

interface BrandingState {
  branding: Branding;
  setBranding: (branding: Branding) => void;
}

export const useBrandingStore = create<BrandingState>((set) => ({
  branding: {},
  setBranding: (branding) => set({ branding }),
}));
