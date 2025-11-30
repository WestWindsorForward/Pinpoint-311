import { useParams } from "react-router-dom";
import { useResidentConfig, useStaffDirectory, useDepartments } from "../api/hooks";
import client from "../api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ServiceRequest, StaffUser } from "../types";
import { LoadScript, GoogleMap, Marker } from "@react-google-maps/api";

export function RequestDetailsPage() {
  const { externalId } = useParams();
  const queryClient = useQueryClient();
  const { data: residentConfig } = useResidentConfig();
  const staffDir = useStaffDirectory();
  const departmentsQuery = useDepartments();
  const mapsKey = residentConfig?.integrations?.google_maps_api_key ?? null;
  const sections = Array.isArray((residentConfig as any)?.settings?.request_sections) ? ((residentConfig as any).settings.request_sections as string[]) : [];
  const reqQuery = useQuery({
    queryKey: ["request", externalId],
    queryFn: async () => (await client.get<ServiceRequest>(`/api/resident/requests/${externalId}`)).data,
    enabled: !!externalId,
  });
  const request = reqQuery.data;
  const meta = (request?.meta ?? {}) as Record<string, any>;

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!request) return;
      await client.patch(`/api/staff/requests/${request.id}`, payload);
    },
    onSuccess: () => {
      if (externalId) queryClient.invalidateQueries({ queryKey: ["request", externalId] });
      queryClient.invalidateQueries({ queryKey: ["staff-requests"], exact: false });
    },
  });

  const addComment = useMutation({
    mutationFn: async ({ notes, isPublic, statusOverride }: { notes: string; isPublic: boolean; statusOverride?: string | null }) => {
      if (!request) return;
      await client.post(`/api/staff/requests/${request.id}/comments`, { notes, public: isPublic, status_override: statusOverride || undefined });
    },
    onSuccess: () => {
      if (externalId) queryClient.invalidateQueries({ queryKey: ["request", externalId] });
    },
  });

  if (!request) {
    return <div className="rounded-2xl bg-white p-6 shadow">Loading…</div>;
  }

  const staffById = new Map<string, StaffUser>();
  (staffDir.data ?? []).forEach((u) => staffById.set(u.id, u));

  const center = { lat: request.latitude ?? 40.299, lng: request.longitude ?? -74.64 };

  return (
    <div className="space-y-6 rounded-2xl bg-white p-6 shadow">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Request {request.external_id}</h1>
          <p className="text-xs text-slate-500">Filed {new Date(request.created_at).toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          <select
            className="rounded-lg border border-slate-300 p-2 text-sm"
            value={request.status}
            onChange={(e) => updateMutation.mutate({ status: e.target.value })}
          >
            {(["received","triaging","assigned","in_progress","waiting_external","resolved","closed"] as const).map(s => (
              <option key={s} value={s}>{String(s).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-300 p-2 text-sm"
            value={request.assigned_department ?? ""}
            onChange={(e) => updateMutation.mutate({ assigned_department: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {(departmentsQuery.data ?? []).map((dep) => (
              <option key={dep.slug} value={dep.slug}>{dep.name}</option>
            ))}
          </select>
          {sections.length > 0 && (
            <select
              className="rounded-lg border border-slate-300 p-2 text-sm"
              defaultValue={(meta.request_section as string) || ""}
              onChange={(e) => updateMutation.mutate({ request_section: e.target.value || null })}
            >
              <option value="">No section</option>
              {sections.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Location</h2>
          {mapsKey ? (
            <LoadScript googleMapsApiKey={mapsKey} libraries={["places"]} onError={() => {
              const el = document.getElementById("map-error");
              if (el) el.textContent = "Maps failed to load. Check API key and billing.";
            }}>
              <GoogleMap mapContainerStyle={{ width: "100%", height: "280px" }} center={center} zoom={15} options={{ mapTypeId: "hybrid" }}>
                <Marker position={center} />
              </GoogleMap>
            </LoadScript>
          ) : (
            <div id="map-error" className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">Maps not configured</div>
          )}
          {request.address_string && <p className="text-xs text-slate-500">{request.address_string}</p>}
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Submitter</h2>
          <ul className="text-sm text-slate-600">
            <li>Name: {meta.resident_name ?? "—"}</li>
            <li>Email: {meta.resident_email ?? "—"}</li>
            <li>Phone: {meta.resident_phone ?? "—"}</li>
            <li>Assigned Department: {request.assigned_department ?? "—"}</li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Attachments</h2>
        {request.attachments && request.attachments.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3">
            {request.attachments.map(att => (
              <li key={att.id} className="rounded-lg border border-slate-200 p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate">{att.file_path.split("/").pop()}</span>
                  <a className="font-semibold text-slate-900 underline" href={`/api/resident/requests/${request.external_id}/attachments/${att.id}`}>Download</a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No attachments</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Comments</h2>
        <ul className="space-y-2">
          {(request.updates ?? []).map(upd => (
            <li key={upd.id} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>{upd.notes}</span>
                <span className="text-xs text-slate-500">{new Date(upd.created_at).toLocaleString()}</span>
              </div>
              {upd.author_id && staffById.get(upd.author_id)?.display_name && (
                <p className="text-xs text-slate-500">by {staffById.get(upd.author_id)!.display_name}</p>
              )}
              {upd.status_override && (
                <p className="text-xs text-slate-500">status: {String(upd.status_override).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
              )}
            </li>
          ))}
        </ul>
        <div className="space-y-2 rounded-lg bg-white p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <input className="rounded-lg border border-slate-300 p-2 text-sm" placeholder="Add comment" id="new-comment" />
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" id="is-public" /> Visible to resident
              </label>
              <select className="rounded-lg border border-slate-300 p-2 text-sm" id="status-override">
                <option value="">No status change</option>
                {(["received","triaging","assigned","in_progress","waiting_external","resolved","closed"] as const).map(s => (
                  <option key={s} value={s}>{String(s).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-right">
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white" onClick={() => {
              const el = document.getElementById("new-comment") as HTMLInputElement | null;
              const pubEl = document.getElementById("is-public") as HTMLInputElement | null;
              const statusEl = document.getElementById("status-override") as HTMLSelectElement | null;
              if (el && el.value.trim()) {
                addComment.mutate({ notes: el.value.trim(), isPublic: !!(pubEl && pubEl.checked), statusOverride: statusEl?.value || undefined });
                el.value = "";
                if (pubEl) pubEl.checked = false;
                if (statusEl) statusEl.value = "";
              }
            }}>Post</button>
          </div>
        </div>
      </section>
    </div>
  );
}
