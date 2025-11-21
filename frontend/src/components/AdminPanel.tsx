import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import client from "../api/client";
import { useResidentConfig } from "../api/hooks";

export function AdminPanel() {
  const { data: config, refetch } = useResidentConfig();
  const [formState, setFormState] = useState({
    town_name: config?.branding?.town_name ?? "",
    hero_text: config?.branding?.hero_text ?? "",
    primary_color: config?.branding?.primary_color ?? "#0f172a",
    secondary_color: config?.branding?.secondary_color ?? "#38bdf8",
  });

  useEffect(() => {
    if (!config?.branding) return;
    setFormState({
      town_name: config.branding.town_name ?? "",
      hero_text: config.branding.hero_text ?? "",
      primary_color: config.branding.primary_color ?? "#0f172a",
      secondary_color: config.branding.secondary_color ?? "#38bdf8",
    });
  }, [config]);

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

  const updateBranding = async () => {
    await client.put("/api/admin/branding", formState);
    refetch();
  };

  const addCategory = async (payload: { slug: string; name: string }) => {
    await client.post("/api/admin/categories", { ...payload, default_priority: "medium" });
    refetch();
  };

  const storeSecret = async (payload: { provider: string; key: string; secret: string }) => {
    await client.post("/api/admin/secrets", payload);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-xl font-semibold">Branding</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Object.entries(formState).map(([key, value]) => (
            <label key={key} className="text-sm text-slate-600">
              {key.replace("_", " ")}
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 p-2"
                value={value}
                onChange={(event) => setFormState((prev) => ({ ...prev, [key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
        <button onClick={updateBranding} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-white">
          Save Branding
        </button>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-xl font-semibold">Runtime Config</h2>
        <RuntimeConfigForm
          config={runtimeConfigQuery.data ?? {}}
          isLoading={runtimeConfigQuery.isLoading}
          isSaving={runtimeMutation.isPending}
          onSave={(payload) => runtimeMutation.mutate(payload)}
        />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-xl font-semibold">Categories</h2>
        <CategoryCreator onSubmit={addCategory} />
        <ul className="mt-4 space-y-2 text-sm">
          {config?.categories.map((category) => (
            <li key={category.slug} className="rounded-xl bg-slate-100 p-3">
              {category.name} ({category.slug})
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-xl font-semibold">Secrets</h2>
        <SecretsForm onSubmit={storeSecret} />
      </section>
    </div>
  );
}

function CategoryCreator({ onSubmit }: { onSubmit: (payload: { slug: string; name: string }) => Promise<void> }) {
  const [form, setForm] = useState({ slug: "", name: "" });
  return (
    <div className="mt-2 flex gap-2">
      <input
        placeholder="slug"
        className="flex-1 rounded-xl border border-slate-300 p-2"
        value={form.slug}
        onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
      />
      <input
        placeholder="name"
        className="flex-1 rounded-xl border border-slate-300 p-2"
        value={form.name}
        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
      />
      <button
        className="rounded-xl bg-emerald-600 px-4 py-2 text-white"
        onClick={() => onSubmit(form).then(() => setForm({ slug: "", name: "" }))}
      >
        Add
      </button>
    </div>
  );
}

function SecretsForm({
  onSubmit,
}: {
  onSubmit: (payload: { provider: string; key: string; secret: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ provider: "smtp", key: "", secret: "" });
  return (
    <div className="space-y-2">
      <div className="grid gap-2 md:grid-cols-3">
        {Object.entries(form).map(([key, value]) => (
          <input
            key={key}
            placeholder={key}
            className="rounded-xl border border-slate-300 p-2"
            value={value}
            onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
          />
        ))}
      </div>
      <button
        className="rounded-xl bg-indigo-600 px-4 py-2 text-white"
        onClick={() => onSubmit(form)}
      >
        Store Secret
      </button>
    </div>
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
    setForm((prev) => ({
      ...prev,
      ...Object.entries(config).reduce<Record<string, string>>((acc, [key, value]) => {
        if (value === undefined || value === null || key === "otel_enabled") return acc;
        acc[key] = String(value);
        return acc;
      }, {}),
      otel_enabled: Boolean(config["otel_enabled"]),
    }));
  }, [config]);

  const updateField = (key: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = () => ({
    google_maps_api_key: form.google_maps_api_key || null,
    developer_report_email: form.developer_report_email || null,
    vertex_ai_project: form.vertex_ai_project || null,
    vertex_ai_location: form.vertex_ai_location || null,
    vertex_ai_model: form.vertex_ai_model || null,
    rate_limit_resident_per_minute: form.rate_limit_resident_per_minute
      ? Number(form.rate_limit_resident_per_minute)
      : null,
    rate_limit_public_per_minute: form.rate_limit_public_per_minute
      ? Number(form.rate_limit_public_per_minute)
      : null,
    otel_enabled: form.otel_enabled,
    otel_endpoint: form.otel_endpoint || null,
    otel_headers: form.otel_headers || null,
  });

  return (
    <div className="space-y-4">
      {isLoading && <p className="text-sm text-slate-500">Loading current settings…</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="rounded-xl border border-slate-300 p-2"
          placeholder="Google Maps API Key"
          value={form.google_maps_api_key}
          onChange={(event) => updateField("google_maps_api_key", event.target.value)}
        />
        <input
          className="rounded-xl border border-slate-300 p-2"
          placeholder="Developer Report Email"
          value={form.developer_report_email}
          onChange={(event) => updateField("developer_report_email", event.target.value)}
        />
        <input
          className="rounded-xl border border-slate-300 p-2"
          placeholder="Vertex AI Project"
          value={form.vertex_ai_project}
          onChange={(event) => updateField("vertex_ai_project", event.target.value)}
        />
        <input
          className="rounded-xl border border-slate-300 p-2"
          placeholder="Vertex AI Location"
          value={form.vertex_ai_location}
          onChange={(event) => updateField("vertex_ai_location", event.target.value)}
        />
        <input
          className="rounded-xl border border-slate-300 p-2"
          placeholder="Vertex AI Model"
          value={form.vertex_ai_model}
          onChange={(event) => updateField("vertex_ai_model", event.target.value)}
        />
        <input
          className="rounded-xl border border-slate-300 p-2"
          placeholder="Resident Rate Limit / min"
          value={form.rate_limit_resident_per_minute}
          onChange={(event) => updateField("rate_limit_resident_per_minute", event.target.value)}
        />
        <input
          className="rounded-xl border border-slate-300 p-2"
          placeholder="Public Rate Limit / min"
          value={form.rate_limit_public_per_minute}
          onChange={(event) => updateField("rate_limit_public_per_minute", event.target.value)}
        />
        <input
          className="rounded-xl border border-slate-300 p-2"
          placeholder="OTEL Endpoint"
          value={form.otel_endpoint}
          onChange={(event) => updateField("otel_endpoint", event.target.value)}
        />
        <input
          className="rounded-xl border border-slate-300 p-2"
          placeholder="OTEL Headers"
          value={form.otel_headers}
          onChange={(event) => updateField("otel_headers", event.target.value)}
        />
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={Boolean(form.otel_enabled)}
          onChange={(event) => updateField("otel_enabled", event.target.checked)}
        />
        Enable OpenTelemetry
      </label>
      <button
        className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        disabled={isSaving}
        onClick={() => onSave(buildPayload())}
      >
        {isSaving ? "Saving..." : "Save Runtime Config"}
      </button>
    </div>
  );
}
