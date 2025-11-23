import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import client from "../api/client";
import { useBoundaries, useDepartments, useResidentConfig, useSecrets, useStaffDirectory } from "../api/hooks";
import type { Department, IssueCategory, SecretSummary, StaffUser } from "../types";

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
  phone_number: string;
  password: string;
};

type SecretFormState = {
  provider: string;
  key: string;
  secret: string;
  notes: string;
};

export function AdminPanel() {
  const queryClient = useQueryClient();
  const { data: residentConfig, refetch } = useResidentConfig();
  const departmentsQuery = useDepartments();
  const staffQuery = useStaffDirectory();
  const secretsQuery = useSecrets();
  const boundariesQuery = useBoundaries();

  const [brandingForm, setBrandingForm] = useState({
    town_name: residentConfig?.branding?.town_name ?? "",
    hero_text: residentConfig?.branding?.hero_text ?? "",
    primary_color: residentConfig?.branding?.primary_color ?? "#0f172a",
    secondary_color: residentConfig?.branding?.secondary_color ?? "#38bdf8",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
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
  });
  const [newStaff, setNewStaff] = useState<StaffFormState>({
    email: "",
    display_name: "",
    role: "staff",
    department: "",
    phone_number: "",
    password: "",
  });
  const [secretForm, setSecretForm] = useState<SecretFormState>({ provider: "smtp", key: "", secret: "", notes: "" });

  useEffect(() => {
    if (!residentConfig?.branding) return;
    setBrandingForm({
      town_name: residentConfig.branding.town_name ?? "",
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
    mutationFn: async (payload: Record<string, unknown>) =>
      client.put("/api/admin/runtime-config", payload),
    onSuccess: () => runtimeConfigQuery.refetch(),
  });

  const brandingMutation = useMutation({
    mutationFn: async () => {
      await client.put("/api/admin/branding", brandingForm);
      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);
        await client.post("/api/admin/branding/assets/logo", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
    },
    onSuccess: () => refetch(),
  });

  const departmentMutation = useMutation({
    mutationFn: async (payload: typeof newDepartment) =>
      client.post("/api/admin/departments", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setNewDepartment({ slug: "", name: "", description: "", contact_email: "", contact_phone: "" });
    },
  });

  const categoryMutation = useMutation({
    mutationFn: async (payload: typeof newCategory) =>
      client.post("/api/admin/categories", { ...payload, default_priority: "medium" }),
    onSuccess: () => {
      setNewCategory({ slug: "", name: "", description: "", default_department_slug: "" });
      refetch();
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
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geo-boundaries"] });
      setNewBoundary({ name: "Primary Boundary", kind: "primary", jurisdiction: "", redirect_url: "", notes: "", geojson: "" });
    },
  });

  const staffMutation = useMutation({
    mutationFn: async (payload: typeof newStaff) => client.post("/api/admin/staff", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
      setNewStaff({ email: "", display_name: "", role: "staff", department: "", phone_number: "", password: "" });
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
    },
  });

  const departments = departmentsQuery.data ?? [];
  const boundaries = boundariesQuery.data ?? [];
  const staff = staffQuery.data ?? [];
  const secrets = secretsQuery.data ?? [];

  const categories = useMemo(() => residentConfig?.categories ?? [], [residentConfig]);

  return (
    <div className="space-y-8">
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
        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-end">
          <label className="text-sm text-slate-600">
            Township Logo
            <input
              type="file"
              accept="image/*"
              className="mt-1 w-full rounded-xl border border-dashed border-slate-300 p-2"
              onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            onClick={() => brandingMutation.mutate()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            disabled={brandingMutation.isPending}
          >
            {brandingMutation.isPending ? "Saving..." : "Save Branding"}
          </button>
        </div>
      </Section>

      <Section
        title="Jurisdiction Boundaries"
        description="Upload GeoJSON for your township boundary and optional exclusion zones (county/state roads)."
      >
        <div className="grid gap-3 md:grid-cols-2">
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
          {boundaries.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {boundaries.map((boundary) => (
                <li key={boundary.id} className="rounded-xl border border-slate-200 p-3">
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
        />
      </Section>

      <Section title="Categories" description="Link categories to departments so routing stays automated.">
        <CategoryForm
          form={newCategory}
          categories={categories}
          departments={departments}
          onChange={setNewCategory}
          onSubmit={() => categoryMutation.mutate(newCategory)}
          isSubmitting={categoryMutation.isPending}
        />
      </Section>

      <Section
        title="Staff Directory"
        description="Invite staff or admins with department assignments. They’ll log in from the staff portal."
      >
        <StaffManager
          staff={staff}
          departments={departments}
          form={newStaff}
          onChange={setNewStaff}
          onSubmit={() => staffMutation.mutate(newStaff)}
          isSubmitting={staffMutation.isPending}
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
  children: React.ReactNode;
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
}: {
  form: DepartmentFormState;
  onChange: (values: DepartmentFormState) => void;
  onSubmit: () => void;
  departments: Department[];
  isSubmitting: boolean;
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
      <div className="flex justify-end">
        <button
          className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving…" : "Add Department"}
        </button>
      </div>
      {departments.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-100">
          {departments.map((dept) => (
            <li key={dept.id} className="p-3 text-sm">
              <p className="font-medium">{dept.name}</p>
              <p className="text-xs uppercase text-slate-500">{dept.slug}</p>
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
}: {
  form: CategoryFormState;
  onChange: (values: CategoryFormState) => void;
  onSubmit: () => void;
  categories: IssueCategory[];
  departments: Department[];
  isSubmitting: boolean;
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
      <div className="flex justify-end">
        <button
          className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving…" : "Add Category"}
        </button>
      </div>
      {categories.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {categories.map((category) => (
            <li key={category.slug} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{category.name}</p>
                  <p className="text-xs uppercase text-slate-500">{category.slug}</p>
                </div>
                {category.department_name && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    {category.department_name}
                  </span>
                )}
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
}: {
  staff: StaffUser[];
  departments: Department[];
  form: StaffFormState;
  onChange: (values: StaffFormState) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
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
          Department
          <select
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={form.department}
            onChange={(event) => onChange({ ...form, department: event.target.value })}
          >
            <option value="">Unassigned</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.slug}>
                {dept.name}
              </option>
            ))}
          </select>
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
      <div className="flex justify-end">
        <button
          className="rounded-xl bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Inviting…" : "Invite Staff"}
        </button>
      </div>
      {staff.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {staff.map((member) => (
            <li key={member.id} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{member.display_name}</p>
                  <p className="text-xs uppercase text-slate-500">{member.email}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase text-slate-600">
                  {member.role}
                </span>
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
}

function RuntimeConfigForm({ config, isLoading, isSaving, onSave }: RuntimeConfigFormProps) {
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
      <div className="flex justify-end">
        <button
          className="rounded-xl bg-slate-900 px-6 py-2 font-semibold text-white disabled:opacity-50"
          onClick={handleSubmit}
          disabled={disabled}
        >
          {isSaving ? "Saving…" : "Save overrides"}
        </button>
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
}

function SecretsForm({ form, secrets, onChange, onSubmit, isSubmitting }: SecretsFormProps) {
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
      <div className="flex justify-end">
        <button
          className="rounded-xl bg-slate-900 px-6 py-2 font-semibold text-white disabled:opacity-50"
          onClick={onSubmit}
          disabled={isSubmitting || !canSubmit}
        >
          {isSubmitting ? "Storing…" : "Store secret"}
        </button>
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
                <li key={secret.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                  <div>
                    <p className="font-semibold text-slate-700">{secret.provider}</p>
                    <p className="text-xs text-slate-500">
                      Stored {new Date(secret.created_at).toLocaleString()}
                      {notes ? ` · ${notes}` : ""}
                    </p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">••••••</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}