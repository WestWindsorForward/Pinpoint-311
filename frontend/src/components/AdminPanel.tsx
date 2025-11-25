import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import client from "../api/client";
import {
  useAdminCategories,
  useBoundaries,
  useDepartments,
  useResidentConfig,
  useSecrets,
  useStaffDirectory,
  useStaffRequests,
} from "../api/hooks";
import type {
  AdminCategory,
  Department,
  IssueCategory,
  ResidentConfig,
  SecretSummary,
  ServiceRequest,
  StaffUser,
} from "../types";

type DepartmentFormState = {
  slug: string;
  name: string;
  description: string;
  contact_email: string;
  contact_phone: string;
};

type CategoryFormState = {
  slug: string;
  name: string;
  description: string;
  default_department_slug: string;
};

type StaffFormState = {
  email: string;
  display_name: string;
  role: string;
  department: string;
  department_slugs: string[];
  phone_number: string;
  password: string;
};

type SecretFormState = {
  provider: string;
  key: string;
  secret: string;
  notes: string;
};

const getErrorMessage = (error: unknown): string => {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) {
      return String((detail as { message: string }).message);
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
};

export function AdminPanel() {
  const queryClient = useQueryClient();
  const { data: residentConfig, refetch } = useResidentConfig();
  const departmentsQuery = useDepartments();
  const staffQuery = useStaffDirectory();
  const secretsQuery = useSecrets();
  const boundariesQuery = useBoundaries();
  const adminCategoriesQuery = useAdminCategories();
  const requestsQuery = useStaffRequests();

  const [brandingForm, setBrandingForm] = useState({
    town_name: residentConfig?.branding?.town_name ?? "",
    site_title: residentConfig?.branding?.site_title ?? "",
    hero_text: residentConfig?.branding?.hero_text ?? "",
    primary_color: residentConfig?.branding?.primary_color ?? "#0f172a",
    secondary_color: residentConfig?.branding?.secondary_color ?? "#38bdf8",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [newDepartment, setNewDepartment] = useState<DepartmentFormState>({
    slug: "",
    name: "",
    description: "",
    contact_email: "",
    contact_phone: "",
  });
  const [newCategory, setNewCategory] = useState<CategoryFormState>({
    slug: "",
    name: "",
    description: "",
    default_department_slug: "",
  });
  const [newBoundary, setNewBoundary] = useState({
    name: "Primary Boundary",
    kind: "primary",
    jurisdiction: "",
    redirect_url: "",
    notes: "",
    geojson: "",
    service_code_filters: [] as string[],
  });
  const [newStaff, setNewStaff] = useState<StaffFormState>({
    email: "",
    display_name: "",
    role: "staff",
    department: "",
    department_slugs: [],
    phone_number: "",
    password: "",
  });
  const [googleBoundaryForm, setGoogleBoundaryForm] = useState({
    query: "",
    place_id: "",
    name: "",
    kind: "primary",
    jurisdiction: "",
    redirect_url: "",
    notes: "",
    service_code_filters: [] as string[],
  });
  const [secretForm, setSecretForm] = useState<SecretFormState>({ provider: "smtp", key: "", secret: "", notes: "" });
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [googleBoundaryError, setGoogleBoundaryError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resettingStaffId, setResettingStaffId] = useState<string | null>(null);
  const brandingSuccess = useTransientSuccess();
  const boundarySuccess = useTransientSuccess();
  const departmentSuccess = useTransientSuccess();
  const categorySuccess = useTransientSuccess();
  const staffSuccess = useTransientSuccess();
  const runtimeSuccess = useTransientSuccess();
  const secretSuccess = useTransientSuccess();
  const googleBoundarySuccess = useTransientSuccess();
  const handleBoundaryCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
    setNewBoundary((prev) => ({ ...prev, service_code_filters: selected }));
  };
  const handleGoogleBoundaryCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
    setGoogleBoundaryForm((prev) => ({ ...prev, service_code_filters: selected }));
  };

  useEffect(() => {
    if (!residentConfig?.branding) return;
    setBrandingForm({
      town_name: residentConfig.branding.town_name ?? "",
      site_title: residentConfig.branding.site_title ?? "",
      hero_text: residentConfig.branding.hero_text ?? "",
      primary_color: residentConfig.branding.primary_color ?? "#0f172a",
      secondary_color: residentConfig.branding.secondary_color ?? "#38bdf8",
    });
  }, [residentConfig]);

  const runtimeConfigQuery = useQuery({
    queryKey: ["runtime-config"],
    queryFn: async () => {
      const { data } = await client.get<Record<string, unknown>>("/api/admin/runtime-config");
      return data;
    },
  });

  const runtimeMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => client.put("/api/admin/runtime-config", payload),
    onSuccess: () => {
      runtimeConfigQuery.refetch();
      runtimeSuccess.flash();
    },
  });

  const brandingMutation = useMutation({
    mutationFn: async () => {
      await client.put("/api/admin/branding", brandingForm);
      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);
        await client.post("/api/admin/branding/assets/logo", formData);
      }
      if (faviconFile) {
        const formData = new FormData();
        formData.append("file", faviconFile);
        await client.post("/api/admin/branding/assets/favicon", formData);
      }
    },
    onSuccess: () => {
      refetch();
      setLogoFile(null);
      setFaviconFile(null);
      setBrandingError(null);
      brandingSuccess.flash();
    },
    onError: (error) => {
      setBrandingError(getErrorMessage(error));
    },
  });

  const departmentMutation = useMutation({
    mutationFn: async (payload: typeof newDepartment) => client.post("/api/admin/departments", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setNewDepartment({ slug: "", name: "", description: "", contact_email: "", contact_phone: "" });
      departmentSuccess.flash();
    },
  });

  const categoryMutation = useMutation({
    mutationFn: async (payload: typeof newCategory) =>
      client.post("/api/admin/categories", { ...payload, default_priority: "medium" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      setNewCategory({ slug: "", name: "", description: "", default_department_slug: "" });
      refetch();
      categorySuccess.flash();
    },
  });

  const boundaryMutation = useMutation({
    mutationFn: async (payload: typeof newBoundary) =>
      client.post("/api/admin/geo-boundary", {
        name: payload.name,
        kind: payload.kind,
        jurisdiction: payload.jurisdiction || null,
        redirect_url: payload.redirect_url || null,
        notes: payload.notes || null,
        geojson: JSON.parse(payload.geojson),
        service_code_filters: payload.service_code_filters ?? [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geo-boundaries"] });
      setNewBoundary({
        name: "Primary Boundary",
        kind: "primary",
        jurisdiction: "",
        redirect_url: "",
        notes: "",
        geojson: "",
        service_code_filters: [],
      });
      boundarySuccess.flash();
    },
  });

  const googleBoundaryMutation = useMutation({
    mutationFn: async () =>
      client.post("/api/admin/geo-boundary/google", {
        query: googleBoundaryForm.query || undefined,
        place_id: googleBoundaryForm.place_id || undefined,
        name: googleBoundaryForm.name || undefined,
        kind: googleBoundaryForm.kind,
        jurisdiction: googleBoundaryForm.jurisdiction || undefined,
        redirect_url: googleBoundaryForm.redirect_url || undefined,
        notes: googleBoundaryForm.notes || undefined,
        service_code_filters: googleBoundaryForm.service_code_filters ?? [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geo-boundaries"] });
      setGoogleBoundaryForm({
        query: "",
        place_id: "",
        name: "",
        kind: "primary",
        jurisdiction: "",
        redirect_url: "",
        notes: "",
        service_code_filters: [],
      });
      setGoogleBoundaryError(null);
      googleBoundarySuccess.flash();
    },
    onError: (error) => {
      setGoogleBoundaryError(getErrorMessage(error));
    },
  });

  const staffMutation = useMutation({
    mutationFn: async (payload: typeof newStaff) =>
      client.post("/api/admin/staff", {
        ...payload,
        department_slugs: payload.department_slugs,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
      setNewStaff({
        email: "",
        display_name: "",
        role: "staff",
        department: "",
        department_slugs: [],
        phone_number: "",
        password: "",
      });
      staffSuccess.flash();
    },
  });

  const secretMutation = useMutation({
    mutationFn: async (payload: SecretFormState) => {
      const metadata = payload.notes.trim() ? { notes: payload.notes.trim() } : undefined;
      await client.post("/api/admin/secrets", {
        provider: payload.provider.trim(),
        key: payload.key.trim(),
        secret: payload.secret.trim(),
        metadata,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      setSecretForm((prev) => ({ ...prev, key: "", secret: "", notes: "" }));
      secretSuccess.flash();
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (departmentId: string) => client.delete(`/api/admin/departments/${departmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["departments"] }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: number) => client.delete(`/api/admin/categories/${categoryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });

  const deleteBoundaryMutation = useMutation({
    mutationFn: async (boundaryId: number) => client.delete(`/api/admin/geo-boundary/${boundaryId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["geo-boundaries"] }),
  });

  const deleteStaffMutation = useMutation({
    mutationFn: async (staffId: string) => client.delete(`/api/admin/staff/${staffId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff-directory"] }),
  });

  const deleteSecretMutation = useMutation({
    mutationFn: async (secretId: string) => client.delete(`/api/admin/secrets/${secretId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["secrets"] }),
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async (requestId: string) => client.delete(`/api/admin/requests/${requestId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-requests"] });
      queryClient.invalidateQueries({ queryKey: ["recent-requests"], exact: false });
    },
  });

  const resetStaffPasswordMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const { data } = await client.post<{ temporary_password: string }>(
        `/api/admin/staff/${staffId}/reset-password`,
      );
      return data;
    },
    onSuccess: ({ temporary_password }) => {
      setResetNotice(`Temporary password copied: ${temporary_password}`);
      try {
        navigator.clipboard.writeText(temporary_password);
      } catch {
        window.prompt("Temporary password", temporary_password);
      }
    },
    onError: (error) => {
      setResetNotice(getErrorMessage(error));
    },
  });

  const handleDepartmentDelete = (departmentId: string) => {
    if (!window.confirm("Delete this department?")) return;
    deleteDepartmentMutation.mutate(departmentId);
  };

  const handleCategoryDelete = (categoryId: number) => {
    if (!window.confirm("Delete this category?")) return;
    deleteCategoryMutation.mutate(categoryId);
  };

  const handleBoundaryDelete = (boundaryId: number) => {
    if (!window.confirm("Delete this jurisdiction boundary?")) return;
    deleteBoundaryMutation.mutate(boundaryId);
  };

  const handleStaffDelete = (staffId: string) => {
    if (!window.confirm("Delete this staff account?")) return;
    deleteStaffMutation.mutate(staffId);
  };

  const handleStaffPasswordReset = (staffId: string) => {
    setResettingStaffId(staffId);
    resetStaffPasswordMutation.mutate(staffId, {
      onSettled: () => setResettingStaffId(null),
    });
  };

  const handleSecretDelete = (secretId: string) => {
    if (!window.confirm("Delete this secret? This action cannot be undone.")) return;
    deleteSecretMutation.mutate(secretId);
  };

  const handleRequestDelete = (requestId: string) => {
    if (!window.confirm("Delete this service request and all history?")) return;
    deleteRequestMutation.mutate(requestId);
  };

  const departments = departmentsQuery.data ?? [];
  const boundaries = boundariesQuery.data ?? [];
  const staff = staffQuery.data ?? [];
  const secrets = secretsQuery.data ?? [];
  const residentCategories = useMemo(() => residentConfig?.categories ?? [], [residentConfig]);
  const adminCategories = adminCategoriesQuery.data ?? [];
  const categoryOptions: IssueCategory[] =
    residentCategories.length > 0 ? residentCategories : adminCategories;
  const serviceRequests = requestsQuery.data ?? [];
  const mapsApiKey = residentConfig?.integrations?.google_maps_api_key;

  useEffect(() => {
    if (!resetNotice) return;
    const timer = window.setTimeout(() => setResetNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [resetNotice]);

  return (
    <div className="space-y-8">
        <Section
          title="Resident Portal Snapshot"
          description="Verify what residents currently see on the public site."
        >
          <PortalPreview branding={residentConfig?.branding} categories={residentCategories} />
        </Section>

        <Section title="Branding & Logo" description="Update live colors, hero copy, and upload a township seal or logo.">
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(brandingForm).map(([key, value]) => (
            <label key={key} className="text-sm text-slate-600">
              {key.replace("_", " ")}
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                value={value}
                onChange={(event) =>
                  setBrandingForm((prev) => ({
                    ...prev,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-600">
            Township logo
            <input
              type="file"
              accept="image/*"
              className="mt-1 w-full rounded-xl border border-dashed border-slate-300 p-2"
              onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-slate-500">Appears in the site header and resident portal preview.</p>
          </label>
          <label className="text-sm text-slate-600">
            Browser favicon
            <input
              type="file"
              accept="image/png,image/x-icon,image/svg+xml"
              className="mt-1 w-full rounded-xl border border-dashed border-slate-300 p-2"
              onChange={(event) => setFaviconFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-slate-500">Use a square image (64px+) to update the tab icon.</p>
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-end md:gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => brandingMutation.mutate()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              disabled={brandingMutation.isPending}
            >
              {brandingMutation.isPending ? "Saving..." : "Save Branding"}
            </button>
            <SaveBadge show={brandingSuccess.isVisible} label="Branding published" />
          </div>
          {brandingError && <p className="text-xs text-rose-500">{brandingError}</p>}
        </div>
      </Section>

      <Section
        title="Jurisdiction Boundaries"
        description="Upload GeoJSON for your township boundary and optionally reroute certain categories to outside jurisdictions."
      >
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-700">Step 1 — Primary service boundary</h4>
              <p className="text-xs text-slate-500">
                Paste GeoJSON for your township or exclusion zones. Requests outside the primary polygon will be
                blocked automatically.
              </p>
            </div>
            <SaveBadge show={boundarySuccess.isVisible} label="Boundary saved" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600">
            Boundary Name
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 p-2"
              value={newBoundary.name}
              onChange={(event) => setNewBoundary((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label className="text-sm text-slate-600">
            Boundary Type
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 p-2"
              value={newBoundary.kind}
              onChange={(event) => setNewBoundary((prev) => ({ ...prev, kind: event.target.value }))}
            >
              <option value="primary">Primary (allowed)</option>
              <option value="exclusion">Excluded jurisdiction</option>
            </select>
          </label>
        <label className="text-sm text-slate-600">
          Jurisdiction Level
          <select
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={newBoundary.jurisdiction}
            onChange={(event) => setNewBoundary((prev) => ({ ...prev, jurisdiction: event.target.value }))}
          >
            <option value="">Not specified</option>
            <option value="township">Township</option>
            <option value="county">County</option>
            <option value="state">State</option>
            <option value="federal">Federal</option>
            <option value="other">Other</option>
          </select>
        </label>
          <label className="text-sm text-slate-600 md:col-span-2">
            Route categories to this jurisdiction
            <select
              multiple
              className="mt-1 h-32 w-full rounded-xl border border-slate-300 p-2"
              value={newBoundary.service_code_filters}
              onChange={handleBoundaryCategoryChange}
            >
              {categoryOptions.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Only the selected service codes will be redirected to this county/state jurisdiction. Leave empty to
              re-route every request that falls within this GeoJSON.
            </p>
          </label>
          <label className="text-sm text-slate-600">
            Redirect URL (optional)
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 p-2"
              value={newBoundary.redirect_url}
              onChange={(event) => setNewBoundary((prev) => ({ ...prev, redirect_url: event.target.value }))}
            />
          </label>
          <label className="text-sm text-slate-600">
            Notes / Message
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 p-2"
              value={newBoundary.notes}
              onChange={(event) => setNewBoundary((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>
          </div>
          <label className="mt-3 block text-sm text-slate-600">
            GeoJSON
            <textarea
              className="mt-1 h-32 w-full rounded-xl border border-slate-300 p-2 font-mono text-xs"
              placeholder='{"type":"Polygon","coordinates":[...]}'
              value={newBoundary.geojson}
              onChange={(event) => setNewBoundary((prev) => ({ ...prev, geojson: event.target.value }))}
            />
          </label>
          <div className="mt-3 flex justify-end">
            <button
              className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
              onClick={() => boundaryMutation.mutate(newBoundary)}
              disabled={boundaryMutation.isPending}
            >
              {boundaryMutation.isPending ? "Uploading…" : "Save Boundary"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-700">Step 2 — Import from Google Maps</h4>
              <p className="text-xs text-slate-500">
                Grab a roadway, campus, or facility polygon from Google Maps and redirect only the categories you select.
              </p>
            </div>
            <SaveBadge show={googleBoundarySuccess.isVisible} label="Boundary imported" />
          </div>
          {!mapsApiKey && (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Add a Google Maps API key under Runtime Config to enable this importer.
            </p>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-600">
              Search phrase
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                placeholder="e.g. County Route 571"
                value={googleBoundaryForm.query}
                onChange={(event) => setGoogleBoundaryForm((prev) => ({ ...prev, query: event.target.value }))}
              />
            </label>
            <label className="text-sm text-slate-600">
              Place ID (optional override)
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                placeholder="ChIJdRcfAPivw4kR8..."
                value={googleBoundaryForm.place_id}
                onChange={(event) => setGoogleBoundaryForm((prev) => ({ ...prev, place_id: event.target.value }))}
              />
            </label>
            <label className="text-sm text-slate-600">
              Override name
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                placeholder="County Route 571"
                value={googleBoundaryForm.name}
                onChange={(event) => setGoogleBoundaryForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="text-sm text-slate-600">
              Kind
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                value={googleBoundaryForm.kind}
                onChange={(event) => setGoogleBoundaryForm((prev) => ({ ...prev, kind: event.target.value }))}
              >
                <option value="primary">Primary (allowed)</option>
                <option value="exclusion">Excluded jurisdiction</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Jurisdiction level
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                value={googleBoundaryForm.jurisdiction}
                onChange={(event) => setGoogleBoundaryForm((prev) => ({ ...prev, jurisdiction: event.target.value }))}
              >
                <option value="">Not specified</option>
                <option value="township">Township</option>
                <option value="county">County</option>
                <option value="state">State</option>
                <option value="federal">Federal</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-sm text-slate-600 md:col-span-2">
              Route categories
              <select
                multiple
                className="mt-1 h-28 w-full rounded-xl border border-slate-300 p-2"
                value={googleBoundaryForm.service_code_filters}
                onChange={handleGoogleBoundaryCategoryChange}
              >
                {categoryOptions.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Leave empty to redirect every request inside the imported boundary.
              </p>
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-600">
              Redirect URL (optional)
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                value={googleBoundaryForm.redirect_url}
                onChange={(event) => setGoogleBoundaryForm((prev) => ({ ...prev, redirect_url: event.target.value }))}
              />
            </label>
            <label className="text-sm text-slate-600">
              Notes / Message
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                value={googleBoundaryForm.notes}
                onChange={(event) => setGoogleBoundaryForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
                onClick={() => googleBoundaryMutation.mutate()}
                disabled={googleBoundaryMutation.isPending || !mapsApiKey}
              >
                {googleBoundaryMutation.isPending ? "Importing…" : "Import from Google"}
              </button>
            </div>
            {googleBoundaryError && <p className="text-xs text-rose-500">{googleBoundaryError}</p>}
          </div>
        </div>

        {boundaries.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {boundaries.map((boundary) => (
              <li key={boundary.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{boundary.name}</p>
                    <p className="text-xs uppercase text-slate-500">{boundary.kind}</p>
                    {boundary.jurisdiction && (
                      <p className="text-xs text-slate-500">Jurisdiction: {boundary.jurisdiction}</p>
                    )}
                    {boundary.redirect_url && (
                      <a
                        href={boundary.redirect_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-slate-600 underline"
                      >
                        Redirect link
                      </a>
                    )}
                    {boundary.service_code_filters && boundary.service_code_filters.length > 0 ? (
                      <p className="text-[11px] text-slate-500">
                        Routes: {boundary.service_code_filters.join(", ")}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500">Routes: all categories</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    onClick={() => handleBoundaryDelete(boundary.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Departments"
        description="Create departments and assign categories/staff to ensure the right team triages incoming issues."
      >
          <DepartmentForm
          form={newDepartment}
          departments={departments}
          onChange={setNewDepartment}
          onSubmit={() => departmentMutation.mutate(newDepartment)}
          isSubmitting={departmentMutation.isPending}
          onDelete={handleDepartmentDelete}
          isDeleting={deleteDepartmentMutation.isPending}
          saveBadge={<SaveBadge show={departmentSuccess.isVisible} />}
        />
      </Section>

      <Section title="Categories" description="Link categories to departments so routing stays automated.">
          <CategoryForm
          form={newCategory}
          categories={adminCategories}
          departments={departments}
          onChange={setNewCategory}
          onSubmit={() => categoryMutation.mutate(newCategory)}
          isSubmitting={categoryMutation.isPending}
          onDelete={handleCategoryDelete}
          isDeleting={deleteCategoryMutation.isPending}
          saveBadge={<SaveBadge show={categorySuccess.isVisible} />}
        />
      </Section>

      <Section
        title="Staff Directory"
        description="Invite staff or admins with department assignments. They’ll log in from the staff portal."
      >
        {resetNotice && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
            {resetNotice}
          </p>
        )}
          <StaffManager
          staff={staff}
          departments={departments}
          form={newStaff}
          onChange={setNewStaff}
          onSubmit={() => staffMutation.mutate(newStaff)}
          isSubmitting={staffMutation.isPending}
          onResetPassword={handleStaffPasswordReset}
          resettingStaffId={resettingStaffId}
          onDelete={handleStaffDelete}
          isDeleting={deleteStaffMutation.isPending}
          saveBadge={<SaveBadge show={staffSuccess.isVisible} label="Invite sent" />}
        />
      </Section>

      <Section
        title="Service Requests"
        description="Review recent submissions, copy resident links, or delete duplicates before they sync anywhere else."
      >
        <RequestsAdminList
          requests={serviceRequests}
          isLoading={requestsQuery.isLoading}
          isDeleting={deleteRequestMutation.isPending}
          onDelete={handleRequestDelete}
        />
      </Section>

      <Section
        title="Runtime Config"
        description="Runtime overrides for API keys, rate limits, and observability without redeploying."
      >
          <RuntimeConfigForm
          config={runtimeConfigQuery.data ?? {}}
          isLoading={runtimeConfigQuery.isLoading}
          isSaving={runtimeMutation.isPending}
            onSave={(payload) => runtimeMutation.mutate(payload)}
            statusBadge={<SaveBadge show={runtimeSuccess.isVisible} label="Runtime updated" />}
        />
      </Section>

      <Section
        title="Secrets"
        description="Store provider secrets securely. Values are write-only and masked after submission."
      >
          <SecretsForm
          form={secretForm}
          secrets={secrets}
          onChange={setSecretForm}
          onSubmit={() => secretMutation.mutate(secretForm)}
          isSubmitting={secretMutation.isPending}
          onDelete={handleSecretDelete}
          isDeleting={deleteSecretMutation.isPending}
          statusBadge={<SaveBadge show={secretSuccess.isVisible} label="Secret stored" />}
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        {description && <p className="text-sm text-slate-500">{description}</p>}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function DepartmentForm({
  form,
  onChange,
  onSubmit,
  departments,
  isSubmitting,
  onDelete,
  isDeleting,
  saveBadge,
}: {
  form: DepartmentFormState;
  onChange: (values: DepartmentFormState) => void;
  onSubmit: () => void;
  departments: Department[];
  isSubmitting: boolean;
  onDelete: (departmentId: string) => void;
  isDeleting: boolean;
  saveBadge?: ReactNode;
}) {
  const fields: Array<{ label: string; key: keyof typeof form; type?: string }> = [
    { label: "Name", key: "name" },
    { label: "Slug", key: "slug" },
    { label: "Description", key: "description" },
    { label: "Contact Email", key: "contact_email", type: "email" },
    { label: "Contact Phone", key: "contact_phone" },
  ];

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map(({ label, key, type }) => (
          <label key={key} className="text-sm text-slate-600">
            {label}
            <input
              type={type ?? "text"}
              className="mt-1 w-full rounded-xl border border-slate-300 p-2"
              value={form[key]}
              onChange={(event) => onChange({ ...form, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
        <div className="flex items-center justify-end gap-3">
          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving…" : "Add Department"}
          </button>
          {saveBadge}
        </div>
      {departments.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-100">
          {departments.map((dept) => (
            <li key={dept.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-medium">{dept.name}</p>
                <p className="text-xs uppercase text-slate-500">{dept.slug}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                onClick={() => onDelete(dept.id)}
                disabled={isDeleting}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CategoryForm({
  form,
  onChange,
  onSubmit,
  categories,
  departments,
  isSubmitting,
  onDelete,
  isDeleting,
  saveBadge,
}: {
  form: CategoryFormState;
  onChange: (values: CategoryFormState) => void;
  onSubmit: () => void;
  categories: AdminCategory[];
  departments: Department[];
  isSubmitting: boolean;
  onDelete: (categoryId: number) => void;
  isDeleting: boolean;
  saveBadge?: ReactNode;
}) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-slate-600">
          Category slug
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.slug}
            onChange={(event) => onChange({ ...form, slug: event.target.value })}
          />
        </label>
        <label className="text-sm text-slate-600">
          Display name
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
          />
        </label>
        <label className="text-sm text-slate-600 md:col-span-2">
          Description
          <textarea
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.description}
            onChange={(event) => onChange({ ...form, description: event.target.value })}
          />
        </label>
        <label className="text-sm text-slate-600 md:col-span-2">
          Owning department
          <select
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.default_department_slug}
            onChange={(event) => onChange({ ...form, default_department_slug: event.target.value })}
          >
            <option value="">Unassigned</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.slug}>
                {dept.name}
              </option>
            ))}
          </select>
        </label>
      </div>
        <div className="flex items-center justify-end gap-3">
          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving…" : "Add Category"}
          </button>
          {saveBadge}
        </div>
      {categories.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {categories.map((category) => (
            <li key={category.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{category.name}</p>
                  <p className="text-xs uppercase text-slate-500">{category.slug}</p>
                  {category.department_name && (
                    <p className="text-[11px] text-slate-500">Dept: {category.department_name}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  onClick={() => onDelete(category.id)}
                  disabled={isDeleting}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function StaffManager({
  staff,
  departments,
  form,
  onChange,
  onSubmit,
  isSubmitting,
  onResetPassword,
  resettingStaffId,
  onDelete,
  isDeleting,
  saveBadge,
}: {
  staff: StaffUser[];
  departments: Department[];
  form: StaffFormState;
  onChange: (values: StaffFormState) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  onResetPassword: (staffId: string) => void;
  resettingStaffId: string | null;
  onDelete: (staffId: string) => void;
  isDeleting: boolean;
  saveBadge?: ReactNode;
}) {
  const handleDepartmentMultiSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
    onChange({ ...form, department_slugs: selected, department: selected[0] ?? "" });
  };

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-slate-600">
          Email
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.email}
            onChange={(event) => onChange({ ...form, email: event.target.value })}
          />
        </label>
        <label className="text-sm text-slate-600">
          Display name
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.display_name}
            onChange={(event) => onChange({ ...form, display_name: event.target.value })}
          />
        </label>
        <label className="text-sm text-slate-600">
          Role
          <select
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.role}
            onChange={(event) => onChange({ ...form, role: event.target.value })}
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Departments (hold Cmd/Ctrl to select multiple)
          <select
            multiple
            className="mt-1 h-32 w-full rounded-xl border border-slate-300 p-2"
            value={form.department_slugs}
            onChange={handleDepartmentMultiSelect}
          >
            {departments.map((dept) => (
              <option key={dept.id} value={dept.slug}>
                {dept.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            The first selection becomes the primary department shown in reports.
          </span>
        </label>
        <label className="text-sm text-slate-600">
          Phone number
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.phone_number}
            onChange={(event) => onChange({ ...form, phone_number: event.target.value })}
          />
        </label>
        <label className="text-sm text-slate-600">
          Temporary password
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.password}
            onChange={(event) => onChange({ ...form, password: event.target.value })}
          />
        </label>
      </div>
        <div className="flex items-center justify-end gap-3">
          <button
            className="rounded-xl bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Inviting…" : "Invite Staff"}
          </button>
          {saveBadge}
        </div>
      {staff.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {staff.map((member) => (
            <li key={member.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{member.display_name}</p>
                  <p className="text-xs uppercase text-slate-500">{member.email}</p>
                  {member.department_slugs && member.department_slugs.length > 0 && (
                    <p className="text-[11px] text-slate-500">
                      Departments: {member.department_slugs.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase text-slate-600">
                    {member.role}
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => onResetPassword(member.id)}
                    disabled={resettingStaffId === member.id}
                  >
                    {resettingStaffId === member.id ? "Resetting…" : "Reset password"}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    onClick={() => onDelete(member.id)}
                    disabled={isDeleting}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

interface RuntimeConfigFormProps {
  config: Record<string, unknown>;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  statusBadge?: ReactNode;
}

function RuntimeConfigForm({ config, isLoading, isSaving, onSave, statusBadge }: RuntimeConfigFormProps) {
  const [form, setForm] = useState({
    google_maps_api_key: "",
    developer_report_email: "",
    vertex_ai_project: "",
    vertex_ai_location: "",
    vertex_ai_model: "",
    rate_limit_resident_per_minute: "",
    rate_limit_public_per_minute: "",
    otel_enabled: false,
    otel_endpoint: "",
    otel_headers: "",
  });

  useEffect(() => {
    const residentLimitValue = config.rate_limit_resident_per_minute;
    const publicLimitValue = config.rate_limit_public_per_minute;
    setForm({
      google_maps_api_key: (config.google_maps_api_key as string) ?? "",
      developer_report_email: (config.developer_report_email as string) ?? "",
      vertex_ai_project: (config.vertex_ai_project as string) ?? "",
      vertex_ai_location: (config.vertex_ai_location as string) ?? "",
      vertex_ai_model: (config.vertex_ai_model as string) ?? "",
      rate_limit_resident_per_minute:
        typeof residentLimitValue === "number" || typeof residentLimitValue === "string"
          ? String(residentLimitValue)
          : "",
      rate_limit_public_per_minute:
        typeof publicLimitValue === "number" || typeof publicLimitValue === "string"
          ? String(publicLimitValue)
          : "",
      otel_enabled: typeof config.otel_enabled === "boolean" ? (config.otel_enabled as boolean) : false,
      otel_endpoint: (config.otel_endpoint as string) ?? "",
      otel_headers: (config.otel_headers as string) ?? "",
    });
  }, [config]);

  const handleChange = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-xl bg-slate-100" />;
  }

  const handleSubmit = () => {
    const numericKeys = ["rate_limit_resident_per_minute", "rate_limit_public_per_minute"];
    const payload: Record<string, unknown> = {};
    (Object.keys(form) as Array<keyof typeof form>).forEach((key) => {
      const value = form[key];
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
          payload[key] = null;
          return;
        }
        if (numericKeys.includes(key)) {
          const parsed = Number(trimmed);
          payload[key] = Number.isFinite(parsed) ? parsed : null;
        } else {
          payload[key] = trimmed;
        }
      } else {
        payload[key] = value;
      }
    });
    onSave(payload);
  };

  const disabled =
    isSaving ||
    Object.entries(form).every(([key, value]) =>
      typeof value === "string" ? value.trim() === "" : key === "otel_enabled" && value === false,
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Runtime overrides live in Postgres so you can rotate API keys or AI models without redeploying. Leave a field
        blank to fall back to the .env defaults.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-600">
          Google Maps API key
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            placeholder="AIza..."
            value={form.google_maps_api_key}
            onChange={(event) => handleChange("google_maps_api_key", event.target.value)}
          />
          <span className="text-xs text-slate-400">Used by the resident map picker.</span>
        </label>
        <label className="text-sm text-slate-600">
          Developer report email
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            placeholder="ops@township.gov"
            value={form.developer_report_email}
            onChange={(event) => handleChange("developer_report_email", event.target.value)}
          />
          <span className="text-xs text-slate-400">Daily digest + heartbeat notifications.</span>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm text-slate-600">
          Vertex AI project
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            placeholder="my-gcp-project"
            value={form.vertex_ai_project}
            onChange={(event) => handleChange("vertex_ai_project", event.target.value)}
          />
          <span className="text-xs text-slate-400">Must match your IAM policy.</span>
        </label>
        <label className="text-sm text-slate-600">
          Vertex AI region
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            placeholder="us-central1"
            value={form.vertex_ai_location}
            onChange={(event) => handleChange("vertex_ai_location", event.target.value)}
          />
        </label>
        <label className="text-sm text-slate-600">
          Gemini model id
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            placeholder="gemini-1.5-flash-002"
            value={form.vertex_ai_model}
            onChange={(event) => handleChange("vertex_ai_model", event.target.value)}
          />
          <span className="text-xs text-slate-400">Serverless Gemini model served by Vertex AI.</span>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-600">
          Resident rate limit (per minute)
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.rate_limit_resident_per_minute}
            onChange={(event) => handleChange("rate_limit_resident_per_minute", event.target.value)}
          />
        </label>
        <label className="text-sm text-slate-600">
          Public rate limit (per minute)
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.rate_limit_public_per_minute}
            onChange={(event) => handleChange("rate_limit_public_per_minute", event.target.value)}
          />
        </label>
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <label className="flex items-center gap-3 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.otel_enabled}
            onChange={(event) => handleChange("otel_enabled", event.target.checked)}
          />
          Enable OpenTelemetry exporter
        </label>
        {form.otel_enabled && (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-600">
              OTLP endpoint
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                placeholder="https://tempo.example.com:4318"
                value={form.otel_endpoint}
                onChange={(event) => handleChange("otel_endpoint", event.target.value)}
              />
            </label>
            <label className="text-sm text-slate-600">
              OTLP headers
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                placeholder="Authorization=Bearer ..."
                value={form.otel_headers}
                onChange={(event) => handleChange("otel_headers", event.target.value)}
              />
              <span className="text-xs text-slate-400">Comma-separated key=value list.</span>
            </label>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          className="rounded-xl bg-slate-900 px-6 py-2 font-semibold text-white disabled:opacity-50"
          onClick={handleSubmit}
          disabled={disabled}
        >
          {isSaving ? "Saving…" : "Save overrides"}
        </button>
        {statusBadge}
      </div>
    </div>
  );
}

interface SecretsFormProps {
  form: SecretFormState;
  secrets: SecretSummary[];
  onChange: (values: SecretFormState) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  onDelete: (secretId: string) => void;
  isDeleting: boolean;
  statusBadge?: ReactNode;
}

function SecretsForm({ form, secrets, onChange, onSubmit, isSubmitting, onDelete, isDeleting, statusBadge }: SecretsFormProps) {
  const canSubmit = form.provider.trim() && form.key.trim() && form.secret.trim();

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Secrets are encrypted and write-only. Paste credentials, click store, and we only keep the provider metadata for future reference.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-600">
          Provider
          <input
            list="secret-providers"
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            placeholder="vertex-ai"
            value={form.provider}
            onChange={(event) => onChange({ ...form, provider: event.target.value })}
          />
          <datalist id="secret-providers">
            <option value="vertex-ai" />
            <option value="smtp" />
            <option value="twilio" />
            <option value="mailgun" />
          </datalist>
        </label>
        <label className="text-sm text-slate-600">
          Key / identifier
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            placeholder="service-account@project.iam.gserviceaccount.com"
            value={form.key}
            onChange={(event) => onChange({ ...form, key: event.target.value })}
          />
        </label>
        <label className="text-sm text-slate-600">
          Secret value
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            placeholder="Paste API key or JSON"
            value={form.secret}
            onChange={(event) => onChange({ ...form, secret: event.target.value })}
          />
          <span className="text-xs text-slate-400">We never display this again after saving.</span>
        </label>
        <label className="text-sm text-slate-600">
          Notes (optional)
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            placeholder="Used for outbound email"
            value={form.notes}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          className="rounded-xl bg-slate-900 px-6 py-2 font-semibold text-white disabled:opacity-50"
          onClick={onSubmit}
          disabled={isSubmitting || !canSubmit}
        >
          {isSubmitting ? "Storing…" : "Store secret"}
        </button>
        {statusBadge}
      </div>
      <div className="rounded-xl border border-slate-200">
        {secrets.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No secrets stored yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {secrets.map((secret) => {
              const notes =
                secret.metadata && typeof secret.metadata["notes"] === "string"
                  ? (secret.metadata["notes"] as string)
                  : undefined;
              return (
                <li key={secret.id} className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
                  <div>
                    <p className="font-semibold text-slate-700">{secret.provider}</p>
                    <p className="text-xs text-slate-500">
                      Stored {new Date(secret.created_at).toLocaleString()}
                      {notes ? ` · ${notes}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">••••••</span>
                    <button
                      type="button"
                      className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      onClick={() => onDelete(secret.id)}
                      disabled={isDeleting}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

interface RequestsAdminListProps {
  requests: ServiceRequest[];
  isLoading: boolean;
  isDeleting: boolean;
  onDelete: (requestId: string) => void;
}

function RequestsAdminList({ requests, isLoading, isDeleting, onDelete }: RequestsAdminListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopy = async (externalId: string) => {
    const shareUrl = `${window.location.origin}/?request=${externalId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(externalId);
      window.setTimeout(() => setCopiedId(null), 2500);
    } catch {
      window.prompt("Copy request link", shareUrl);
    }
  };

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />;
  }

  if (requests.length === 0) {
    return <p className="text-sm text-slate-500">No requests have been submitted yet.</p>;
  }

  const recent = requests.slice(0, 8);

  return (
    <div className="space-y-3">
      {recent.map((request) => (
        <div key={request.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                {request.description || "No description provided"}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{request.status}</p>
              <p className="text-xs text-slate-500">
                #{request.external_id} · {request.service_code} ·{" "}
                {new Date(request.created_at).toLocaleString()}
              </p>
              {request.jurisdiction_warning && (
                <p className="text-xs text-amber-600">{request.jurisdiction_warning}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                onClick={() => handleCopy(request.external_id)}
              >
                {copiedId === request.external_id ? "Link copied" : "Copy resident link"}
              </button>
              <button
                type="button"
                className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                onClick={() => onDelete(request.id)}
                disabled={isDeleting}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
      {requests.length > recent.length && (
        <p className="text-xs text-slate-500">
          Showing {recent.length} of {requests.length} requests. Visit the Staff Command Center for the full queue.
        </p>
      )}
    </div>
  );
}

function PortalPreview({
  branding,
  categories,
}: {
  branding?: ResidentConfig["branding"];
  categories: IssueCategory[];
}) {
  const primary = branding?.primary_color ?? "#0f172a";
  const secondary = branding?.secondary_color ?? "#38bdf8";
  const topCategories = categories.slice(0, 4);

  return (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white shadow"
        style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
      >
        {branding?.logo_url && (
          <img
            src={branding.logo_url}
            alt="Township logo"
            className="absolute right-4 top-4 h-12 w-12 rounded-full border border-white/30 bg-white/20 object-cover shadow"
          />
        )}
        <p className="text-xs uppercase tracking-[0.3em] text-white/70">
          {branding?.town_name ?? "Your Township"}
        </p>
        <h3 className="mt-2 text-2xl font-semibold">
          {branding?.site_title ?? "Request Management"}
        </h3>
        <p className="text-sm text-white/80">
          {branding?.hero_text ?? "We keep your town moving"}
        </p>
        <div className="mt-4 flex gap-4 text-xs text-white/80">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: primary }} />
            Primary
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: secondary }} />
            Secondary
          </span>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">Request categories</h4>
          <span className="text-xs text-slate-500">{categories.length} published</span>
        </div>
        {categories.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Use the form below to create your first category.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {topCategories.map((category) => (
                <li key={category.slug} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                  <div>
                    <p className="font-medium text-slate-800">{category.name}</p>
                    <p className="text-[11px] uppercase text-slate-400">{category.slug}</p>
                  </div>
                  {category.department_name && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {category.department_name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {categories.length > 4 && (
              <p className="mt-2 text-[11px] text-slate-500">
                +{categories.length - 4} more categories visible on the portal
              </p>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Branding, categories, and secrets update instantly for residents.
        </p>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open resident portal
        </a>
      </div>
    </div>
  );
}

function useTransientSuccess(duration = 3200) {
  const [isVisible, setIsVisible] = useState(false);
  const flash = useCallback(() => setIsVisible(true), []);
  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => setIsVisible(false), duration);
    return () => clearTimeout(timer);
  }, [isVisible, duration]);
  return { isVisible, flash };
}

function SaveBadge({ show, label = "Saved" }: { show: boolean; label?: string }) {
  if (!show) {
    return null;
  }
  return (
    <span role="status" className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
      {label}
    </span>
  );
}