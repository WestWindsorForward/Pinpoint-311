import { useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../../api/client";
import { useDepartments, useStaffDirectory } from "../../api/hooks";
import type { Department, StaffUser } from "../../types";
import { useState } from "react";

type StaffFormState = { email: string; display_name: string; role: string; department: string; department_slugs: string[]; phone_number: string; password: string };

export function StaffPage() {
  const queryClient = useQueryClient();
  const departmentsQuery = useDepartments();
  const staffQuery = useStaffDirectory();
  const [form, setForm] = useState<StaffFormState>({ email: "", display_name: "", role: "staff", department: "", department_slugs: [], phone_number: "", password: "" });
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const inviteMutation = useMutation({
    mutationFn: async (payload: StaffFormState) => client.post("/api/admin/staff", { ...payload, department_slugs: payload.department_slugs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
      setForm({ email: "", display_name: "", role: "staff", department: "", department_slugs: [], phone_number: "", password: "" });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (staffId: string) => client.delete(`/api/admin/staff/${staffId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff-directory"] }),
  });
  const resetMutation = useMutation({
    mutationFn: async (staffId: string) => client.post<{ temporary_password: string }>(`/api/admin/staff/${staffId}/reset-password`),
    onSuccess: ({ data }) => {
      setResetNotice(`Temporary password copied: ${data.temporary_password}`);
      try { navigator.clipboard.writeText(data.temporary_password); } catch { /* noop */ }
    },
    onSettled: () => setResettingId(null),
  });
  const departments = departmentsQuery.data ?? [];
  const staff = staffQuery.data ?? [];
  const updateMutation = useMutation({
    mutationFn: async (member: StaffUser) => client.put(`/api/admin/staff/${member.id}`, { display_name: member.display_name, role: member.role, department_slugs: member.department_slugs ?? [] }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["staff-directory"] });
      setSaved((variables as StaffUser).id);
    },
  });
  const [saved, setSaved] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<StaffUser> | null>(null);
  const handleDepartments = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
    setForm({ ...form, department_slugs: selected, department: selected[0] ?? "" });
  };
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Staff Directory</h1>
        <p className="text-sm text-slate-500">Invite staff/admins and reset passwords.</p>
      </div>
      {resetNotice && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">{resetNotice}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-slate-600">Email<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="text-sm text-slate-600">Display name<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
        <label className="text-sm text-slate-600">Role<select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
        <label className="text-sm text-slate-600">Departments<select multiple className="mt-1 h-32 w-full rounded-xl border border-slate-300 p-2" value={form.department_slugs} onChange={handleDepartments}>{departments.map((dept: Department) => (<option key={dept.id} value={dept.slug}>{dept.name}</option>))}</select></label>
        <label className="text-sm text-slate-600">Phone number<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} /></label>
        <label className="text-sm text-slate-600">Temporary password<input type="password" className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      </div>
      <div className="flex items-center justify-end gap-3">
        <button className="rounded-xl bg-indigo-600 px-4 py-2 text-white disabled:opacity-50" onClick={() => inviteMutation.mutate(form)} disabled={inviteMutation.isPending}>{inviteMutation.isPending ? "Inviting…" : "Invite Staff"}</button>
      </div>
      {staff.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {staff.map((member: StaffUser) => (
            <li key={member.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex-1">
                  {editingId === (member.id as any) ? (
                    <div>
                      <input className="rounded-md border p-2" value={draft?.display_name ?? member.display_name} onChange={(e) => setDraft({ ...(draft ?? {}), id: member.id, display_name: e.target.value })} />
                      <p className="text-xs uppercase text-slate-500">{member.email}</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <select className="rounded-md border p-2" value={draft?.role ?? member.role} onChange={(e) => setDraft({ ...(draft ?? {}), id: member.id, role: e.target.value as any })}>
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                        <select multiple className="rounded-md border p-2" value={draft?.department_slugs ?? member.department_slugs ?? []} onChange={(e) => { const selected = Array.from(e.target.selectedOptions).map((o) => o.value); setDraft({ ...(draft ?? {}), id: member.id, department_slugs: selected }); }}>
                          {departments.map((dept: Department) => (<option key={dept.id} value={dept.slug}>{dept.name}</option>))}
                        </select>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button className="rounded-full border border-slate-200 px-3 py-1 text-xs" onClick={() => { if (draft) updateMutation.mutate({ ...(member as any), ...draft } as any); setEditingId(null); }} disabled={updateMutation.isPending}>Save</button>
                        <button className="rounded-full border border-slate-200 px-3 py-1 text-xs" onClick={() => { setEditingId(null); setDraft(null); }}>Cancel</button>
                        <span className="text-[11px] font-semibold uppercase text-emerald-600">{saved === (member.id as any) ? "Saved" : ""}</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium">{member.display_name}</p>
                      <p className="text-xs uppercase text-slate-500">{member.email}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase text-slate-600">{member.role}</span>
                  {editingId === (member.id as any) ? null : (
                    <button className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => { setEditingId(member.id as any); setDraft({ ...member } as any); }}>Edit</button>
                  )}
                  <button className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50" onClick={() => { setResettingId(member.id); resetMutation.mutate(member.id); }} disabled={resettingId === member.id}>
                    {resettingId === member.id ? "Resetting…" : "Reset password"}
                  </button>
                  <button className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50" onClick={() => deleteMutation.mutate(member.id)} disabled={deleteMutation.isPending}>Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
