import { useState } from "react";

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

  const updateBranding = async () => {
    await client.put(
      "/api/admin/branding",
      formState,
      { headers: { "X-Admin-Key": import.meta.env.VITE_ADMIN_KEY ?? "dev-admin-key" } },
    );
    refetch();
  };

  const addCategory = async (payload: { slug: string; name: string }) => {
    await client.post(
      "/api/admin/categories",
      { ...payload, default_priority: "medium" },
      { headers: { "X-Admin-Key": import.meta.env.VITE_ADMIN_KEY ?? "dev-admin-key" } },
    );
    refetch();
  };

  const storeSecret = async (payload: { provider: string; key: string; secret: string }) => {
    await client.post("/api/admin/secrets", payload, {
      headers: { "X-Admin-Key": import.meta.env.VITE_ADMIN_KEY ?? "dev-admin-key" },
    });
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
