import { useEffect, useState } from "react";

import { apiClient } from "../api/client";
import { TownshipConfigResponse } from "../api/types";

export function useTownshipConfig() {
  const [config, setConfig] = useState<TownshipConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        setLoading(true);
        const { data } = await apiClient.get<TownshipConfigResponse>("/public/config");
        setConfig(data);
      } catch (err) {
        setError("Failed to load township configuration");
      } finally {
        setLoading(false);
      }
    }

    fetchConfig();
  }, []);

  return { config, loading, error } as const;
}
