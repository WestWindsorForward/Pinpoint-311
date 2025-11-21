import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import client from "./client";
import type {
  Department,
  GeoBoundary,
  ResidentConfig,
  SecretSummary,
  ServiceRequest,
  StaffUser,
} from "../types";

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
      const { data } = await client.get<ServiceRequest[]>("/api/staff/requests");
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
      const { data } = await client.patch<ServiceRequest>(`/api/staff/requests/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-requests"] });
    },
  });
};

export const useDepartments = () =>
  useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await client.get<Department[]>("/api/admin/departments");
      return data;
    },
  });

export const useBoundaries = () =>
  useQuery({
    queryKey: ["geo-boundaries"],
    queryFn: async () => {
      const { data } = await client.get<GeoBoundary[]>("/api/admin/geo-boundary");
      return data;
    },
  });

export const useStaffDirectory = () =>
  useQuery({
    queryKey: ["staff-directory"],
    queryFn: async () => {
      const { data } = await client.get<StaffUser[]>("/api/admin/staff");
      return data;
    },
  });

export const useSecrets = () =>
  useQuery({
    queryKey: ["secrets"],
    queryFn: async () => {
      const { data } = await client.get<SecretSummary[]>("/api/admin/secrets");
      return data;
    },
  });

export const useRecentRequests = (limit = 5) =>
  useQuery({
    queryKey: ["recent-requests", limit],
    queryFn: async () => {
      const { data } = await client.get<ServiceRequest[]>(`/api/resident/requests/recent?limit=${limit}`);
      return data;
    },
  });
