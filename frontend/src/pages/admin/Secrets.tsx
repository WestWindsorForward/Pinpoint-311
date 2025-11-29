import { useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../../api/client";
import { useSecrets } from "../../api/hooks";
import type { SecretSummary } from "../../types";
import { useState } from "react";
import InfoBox from "../../components/InfoBox";

type SecretFormState = { provider: string; key: string; secret: string; notes: string };

export function SecretsPage() {
  const queryClient = useQueryClient();
  const secretsQuery = useSecrets();
  const [form, setForm] = useState<SecretFormState>({ provider: "", key: "", secret: "", notes: "" });
  const storeMutation = useMutation({
    mutationFn: async (payload: SecretFormState) => {
      const metadata = payload.notes.trim() ? { notes: payload.notes.trim() } : undefined;
      await client.post("/api/admin/secrets", { provider: payload.provider.trim(), key: payload.key.trim(), secret: payload.secret.trim(), metadata });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      setForm({ provider: "", key: "", secret: "", notes: "" });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (secretId: string) => client.delete(`/api/admin/secrets/${secretId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["secrets"] }),
  });
  const secrets = secretsQuery.data ?? [];
  const canSubmit = form.provider.trim() && form.key.trim() && form.secret.trim();
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Secrets</h1>
        <p className="text-sm text-slate-500">Store provider secrets securely. Values are write-only and masked after submission.</p>
      </div>
      <InfoBox title="Required Providers">
        <ul className="list-disc pl-5">
          <li>Google Maps API key (Maps/Places) for boundary import</li>
          <li>Email SMTP/API credentials for outbound notifications</li>
          <li>SMS provider API key (e.g., Twilio) for text alerts</li>
          <li>AI provider credentials (e.g., Vertex AI) if AI features enabled</li>
        </ul>
      </InfoBox>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-600">Provider<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="vertex-ai" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></label>
        <label className="text-sm text-slate-600">Key / identifier<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="service-account@project.iam.gserviceaccount.com" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></label>
        <label className="text-sm text-slate-600">Secret value<input type="password" className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="Paste API key or JSON" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} /><span className="text-xs text-slate-400">We never display this again after saving.</span></label>
        <label className="text-sm text-slate-600">Notes<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" placeholder="Used for outbound email" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3"><button className="rounded-xl bg-slate-900 px-6 py-2 font-semibold text-white disabled:opacity-50" onClick={() => storeMutation.mutate(form)} disabled={storeMutation.isPending || !canSubmit}>{storeMutation.isPending ? "Storing…" : "Store secret"}</button></div>
      <div className="rounded-xl border border-slate-200">
        {secrets.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No secrets stored yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {secrets.map((secret: SecretSummary) => {
              const notes = secret.metadata && typeof secret.metadata["notes"] === "string" ? (secret.metadata["notes"] as string) : undefined;
              return (
                <li key={secret.id} className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
                  <div>
                    <p className="font-semibold text-slate-700">{secret.provider}</p>
                    <p className="text-xs text-slate-500">Stored {new Date(secret.created_at).toLocaleString()}{notes ? ` · ${notes}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">••••••</span>
                    <button type="button" className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50" onClick={() => deleteMutation.mutate(secret.id)} disabled={deleteMutation.isPending}>Delete</button>
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
