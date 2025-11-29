import { useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../../api/client";
import { useAdminCategories, useDepartments } from "../../api/hooks";
import type { AdminCategory, Department } from "../../types";
import { useState } from "react";

type CategoryFormState = { slug: string; name: string; description: string; default_department_slug: string };

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const categoriesQuery = useAdminCategories();
  const departmentsQuery = useDepartments();
  const [form, setForm] = useState<CategoryFormState>({ slug: "", name: "", description: "", default_department_slug: "" });
  const createMutation = useMutation({
    mutationFn: async (payload: CategoryFormState) => client.post("/api/admin/categories", { ...payload, default_priority: "medium" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      setForm({ slug: "", name: "", description: "", default_department_slug: "" });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (categoryId: number) => client.delete(`/api/admin/categories/${categoryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });
  const categories = categoriesQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<AdminCategory> | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const updateMutation = useMutation({
    mutationFn: async (category: AdminCategory) => client.put(`/api/admin/categories/${category.id}`, { name: category.name, slug: category.slug, description: category.description, default_department_slug: (category as any).default_department_slug ?? undefined }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      setSavedId((variables as AdminCategory).id);
    },
  });
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm text-slate-500">Link categories to departments for routing.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-slate-600">
          Category slug
          <input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </label>
        <label className="text-sm text-slate-600">
          Display name
          <input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="text-sm text-slate-600 md:col-span-2">
          Description
          <textarea className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="text-sm text-slate-600 md:col-span-2">
          Owning department
          <select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.default_department_slug} onChange={(e) => setForm({ ...form, default_department_slug: e.target.value })}>
            <option value="">Unassigned</option>
            {departments.map((dept: Department) => (
              <option key={dept.id} value={dept.slug}>{dept.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-end gap-3">
        <button className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Saving…" : "Add Category"}
        </button>
      </div>
      {categories.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {categories.map((category: AdminCategory) => (
            <li key={category.id} className="p-3 text-sm">
              {editingId === category.id ? (
                <div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input className="rounded-md border p-2" value={draft?.name ?? category.name} onChange={(e) => setDraft({ ...(draft ?? {}), id: category.id, name: e.target.value })} />
                    <input className="rounded-md border p-2" value={draft?.slug ?? category.slug} onChange={(e) => setDraft({ ...(draft ?? {}), id: category.id, slug: e.target.value })} />
                    <textarea className="rounded-md border p-2 md:col-span-2" value={draft?.description ?? category.description ?? ""} onChange={(e) => setDraft({ ...(draft ?? {}), id: category.id, description: e.target.value })} />
                    <label className="text-sm text-slate-600 md:col-span-2">
                      Owning department
                      <select className="mt-1 w-full rounded-md border p-2" value={(draft as any)?.default_department_slug ?? (category as any).default_department_slug ?? ""} onChange={(e) => setDraft({ ...(draft ?? {}), id: category.id, default_department_slug: e.target.value } as any)}>
                        <option value="">Unassigned</option>
                        {departments.map((dept) => (
                          <option key={dept.id} value={dept.slug}>{dept.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button className="rounded-full border border-slate-200 px-3 py-1 text-xs" onClick={() => { if (draft) updateMutation.mutate({ ...(category as any), ...draft } as any); setEditingId(null); }} disabled={updateMutation.isPending}>Save</button>
                    <button className="rounded-full border border-slate-200 px-3 py-1 text-xs" onClick={() => { setEditingId(null); setDraft(null); }}>Cancel</button>
                    <span className="text-[11px] font-semibold uppercase text-emerald-600">{savedId === category.id ? "Saved" : ""}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{category.name}</p>
                    <p className="text-xs uppercase text-slate-500">{category.slug}</p>
                    {category.department_name && (
                      <p className="text-[11px] text-slate-500">Dept: {category.department_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-full border border-slate-200 px-3 py-1 text-xs" onClick={() => { setEditingId(category.id); setDraft({ ...category } as any); }}>Edit</button>
                    <button type="button" className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50" onClick={() => deleteMutation.mutate(category.id)} disabled={deleteMutation.isPending}>Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
