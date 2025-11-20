import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import client from "./client";
import type { ResidentConfig, ServiceRequest } from "../types";

export const useResidentConfig = () =>
  useQuery({
    queryKey: ["resident-config"],
    queryFn: async () => {
      const { data } = await client.get<ResidentConfig>("/api/resident/config");
      return data;
    },
  });

export const useStaffRequests = () =>
  useQuery({
    queryKey: ["staff-requests"],
    queryFn: async () => {
      const { data } = await client.get<ServiceRequest[]>("/api/staff/requests", {
        headers: { "X-Admin-Key": import.meta.env.VITE_ADMIN_KEY ?? "dev-admin-key" },
      });
      return data;
    },
  });

export const useCreateResidentRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: FormData) => {
      const { data } = await client.post<ServiceRequest>("/api/resident/requests", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-requests"] });
    },
  });
};

export const useUpdateStaffRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { data } = await client.patch<ServiceRequest>(
        `/api/staff/requests/${id}`,
        payload,
        {
          headers: { "X-Admin-Key": import.meta.env.VITE_ADMIN_KEY ?? "dev-admin-key" },
        },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-requests"] });
    },
  });
};
