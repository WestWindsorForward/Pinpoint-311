import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../../api/client";
import { useEffect, useState } from "react";

export function RuntimeConfigPage() {
  const queryClient = useQueryClient();
  const runtimeQuery = useQuery({ queryKey: ["runtime-config"], queryFn: async () => (await client.get<Record<string, unknown>>("/api/admin/runtime-config")).data });
  const { data: config = {}, isLoading } = runtimeQuery;
  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => client.put("/api/admin/runtime-config", payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["runtime-config"] });
      await runtimeQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["resident-config"] });
    },
  });
  const submit = (payload: Record<string, unknown>) => mutation.mutate(payload);
  const formDefaults = {
    google_maps_api_key: (config as any).google_maps_api_key ?? "",
    developer_report_email: (config as any).developer_report_email ?? "",
    vertex_ai_project: (config as any).vertex_ai_project ?? "",
    vertex_ai_location: (config as any).vertex_ai_location ?? "",
    vertex_ai_model: (config as any).vertex_ai_model ?? "",
    rate_limit_resident_per_minute: String((config as any).rate_limit_resident_per_minute ?? ""),
    rate_limit_public_per_minute: String((config as any).rate_limit_public_per_minute ?? ""),
    otel_enabled: Boolean((config as any).otel_enabled ?? false),
    otel_endpoint: (config as any).otel_endpoint ?? "",
    otel_headers: (config as any).otel_headers ?? "",
    email_enabled: Boolean((config as any).email_enabled ?? false),
    sms_enabled: Boolean((config as any).sms_enabled ?? false),
    ai_enabled: Boolean((config as any).ai_enabled ?? false),
    request_sections: Array.isArray((config as any).request_sections) ? (config as any).request_sections : [],
  };
  if (isLoading) return <div className="h-32 animate-pulse rounded-xl bg-slate-100" />;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Runtime Config</h1>
        <p className="text-sm text-slate-500">Runtime overrides without redeploying. Leave fields blank to use .env defaults.</p>
      </div>
      <RuntimeConfigForm defaults={formDefaults} onSave={submit} isSaving={mutation.isPending} />
    </div>
  );
}

function RuntimeConfigForm({ defaults, onSave, isSaving }: { defaults: Record<string, any>; onSave: (payload: Record<string, unknown>) => void; isSaving: boolean }) {
  const [form, setForm] = useState(defaults);
  useEffect(() => {
    setForm(defaults);
  }, [defaults]);
  const handleChange = (key: string, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));
  const handleSubmit = () => {
    const numericKeys = ["rate_limit_resident_per_minute", "rate_limit_public_per_minute"];
    const payload: Record<string, unknown> = {};
    Object.keys(form).forEach((key) => {
      const value = (form as any)[key];
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) { payload[key] = null; return; }
        if (numericKeys.includes(key)) {
          const parsed = Number(trimmed); payload[key] = Number.isFinite(parsed) ? parsed : null;
        } else { payload[key] = trimmed; }
      } else { payload[key] = value; }
    });
    onSave(payload);
  };
  const disabled = isSaving || Object.entries(form).every(([key, value]) => typeof value === "string" ? (value as string).trim() === "" : key === "otel_enabled" && value === false);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-600">Google Maps API key<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="AIza..." value={form.google_maps_api_key} onChange={(e) => handleChange("google_maps_api_key", e.target.value)} /></label>
        <label className="text-sm text-slate-600">Developer report email<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="ops@township.gov" value={form.developer_report_email} onChange={(e) => handleChange("developer_report_email", e.target.value)} /></label>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm text-slate-600">Vertex AI project<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="my-gcp-project" value={form.vertex_ai_project} onChange={(e) => handleChange("vertex_ai_project", e.target.value)} /></label>
        <label className="text-sm text-slate-600">Vertex AI region<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="us-central1" value={form.vertex_ai_location} onChange={(e) => handleChange("vertex_ai_location", e.target.value)} /></label>
        <label className="text-sm text-slate-600">Gemini model id<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="gemini-1.5-flash-002" value={form.vertex_ai_model} onChange={(e) => handleChange("vertex_ai_model", e.target.value)} /></label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-600">Resident rate limit<input type="number" min={1} className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.rate_limit_resident_per_minute} onChange={(e) => handleChange("rate_limit_resident_per_minute", e.target.value)} /></label>
        <label className="text-sm text-slate-600">Public rate limit<input type="number" min={1} className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.rate_limit_public_per_minute} onChange={(e) => handleChange("rate_limit_public_per_minute", e.target.value)} /></label>
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <label className="flex items-center gap-3 text-sm text-slate-600"><input type="checkbox" checked={form.otel_enabled} onChange={(e) => handleChange("otel_enabled", e.target.checked)} />Enable OpenTelemetry exporter</label>
        {form.otel_enabled && (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-600">OTLP endpoint<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="https://tempo.example.com:4318" value={form.otel_endpoint} onChange={(e) => handleChange("otel_endpoint", e.target.value)} /></label>
            <label className="text-sm text-slate-600">OTLP headers<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="Authorization=Bearer ..." value={form.otel_headers} onChange={(e) => handleChange("otel_headers", e.target.value)} /><span className="text-xs text-slate-400">Comma-separated key=value list.</span></label>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700">Feature Modules</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="flex items-center gap-3 text-sm text-slate-600"><input type="checkbox" checked={form.email_enabled} onChange={(e) => handleChange("email_enabled", e.target.checked)} />Email Notifications</label>
          <label className="flex items-center gap-3 text-sm text-slate-600"><input type="checkbox" checked={form.sms_enabled} onChange={(e) => handleChange("sms_enabled", e.target.checked)} />SMS Alerts</label>
          <label className="flex items-center gap-3 text-sm text-slate-600"><input type="checkbox" checked={form.ai_enabled} onChange={(e) => handleChange("ai_enabled", e.target.checked)} />AI Assistance</label>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700">Request Sections</p>
        <p className="text-xs text-slate-500">Define the sections your staff can assign to requests (one per line).</p>
        <textarea className="mt-2 h-28 w-full rounded-xl border border-slate-300 p-2 font-mono text-xs" value={(form.request_sections || []).join("\n")} onChange={(e) => handleChange("request_sections", e.target.value.split(/\n+/).map(s => s.trim()).filter(Boolean))} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3"><button className="rounded-xl bg-slate-900 px-6 py-2 font-semibold text-white disabled:opacity-50" onClick={handleSubmit} disabled={disabled}>{isSaving ? "Saving…" : "Save overrides"}</button></div>
    </div>
  );
}
