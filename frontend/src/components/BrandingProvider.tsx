import { useEffect } from "react";

import { useBrandingStore } from "../store/branding";
import type { Branding } from "../types";

interface Props {
  branding?: Branding;
  children: React.ReactNode;
}

const DEFAULT_FAVICON = "/vite.svg";

export function BrandingProvider({ branding, children }: Props) {
  const { setBranding } = useBrandingStore();

  useEffect(() => {
    if (!branding) return;
    setBranding(branding);
    if (branding.primary_color) {
      document.documentElement.style.setProperty(
        "--color-primary",
        hexToRgb(branding.primary_color),
      );
    }
    if (branding.secondary_color) {
      document.documentElement.style.setProperty(
        "--color-secondary",
        hexToRgb(branding.secondary_color),
      );
    }
  }, [branding, setBranding]);

  useEffect(() => {
    const title = branding?.site_title ?? branding?.town_name ?? "Township Request Portal";
    document.title = title;
    updateFavicon(branding?.favicon_url);
  }, [branding]);

  return <>{children}</>;
}

function hexToRgb(hex: string): string {
  const value = hex.replace("#", "");
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r} ${g} ${b}`;
}

function updateFavicon(url?: string | null) {
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    return;
  }
  link.href = url || DEFAULT_FAVICON;
}
