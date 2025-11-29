import { useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../../api/client";
import { useAdminCategories, useBoundaries, useResidentConfig, useCategoryExclusions, useRoadExclusions } from "../../api/hooks";
import type { IssueCategory } from "../../types";
import { useMemo, useState } from "react";
import InfoBox from "../../components/InfoBox";

export function BoundariesPage() {
  const queryClient = useQueryClient();
  const boundariesQuery = useBoundaries();
  const adminCategoriesQuery = useAdminCategories();
  const { data: residentConfig } = useResidentConfig();
  const categoryExclusionsQuery = useCategoryExclusions();
  const roadExclusionsQuery = useRoadExclusions();
  const [activeTab, setActiveTab] = useState<"primary" | "exclusions">("primary");
  const [primaryMode, setPrimaryMode] = useState<"google" | "geojson" | "arcgis">("google");
  const [upload, setUpload] = useState({ name: "Primary Boundary", kind: "primary", jurisdiction: "", redirect_url: "", notes: "", geojson: "", service_code_filters: [] as string[], road_name_filters: [] as string[] });
  const [google, setGoogle] = useState({ query: "", place_id: "", name: "", kind: "primary", jurisdiction: "", redirect_url: "", notes: "", service_code_filters: [] as string[], road_name_filters: [] as string[] });
  const [arcgis, setArcgis] = useState({ layer_url: "", where: "", name: "ArcGIS Layer", kind: "primary", jurisdiction: "", redirect_url: "", notes: "", service_code_filters: [] as string[], road_name_filters: [] as string[] });
  const mapsApiKey = residentConfig?.integrations?.google_maps_api_key;
  const categories = useMemo<IssueCategory[]>(() => residentConfig?.categories ?? adminCategoriesQuery.data ?? [], [residentConfig, adminCategoriesQuery.data]);
  const [catForm, setCatForm] = useState({ category_slug: "", redirect_name: "", redirect_url: "", redirect_message: "", is_active: true });
  const [roadForm, setRoadForm] = useState({ road_name: "", redirect_name: "", redirect_url: "", redirect_message: "", is_active: true });
  const handleUploadFilters = (e: React.ChangeEvent<HTMLSelectElement>) => setUpload((prev) => ({ ...prev, service_code_filters: Array.from(e.target.selectedOptions).map((o) => o.value) }));
  const handleGoogleFilters = (e: React.ChangeEvent<HTMLSelectElement>) => setGoogle((prev) => ({ ...prev, service_code_filters: Array.from(e.target.selectedOptions).map((o) => o.value) }));
  const uploadMutation = useMutation({
    mutationFn: async () => client.post("/api/admin/geo-boundary", { name: upload.name, kind: upload.kind, jurisdiction: upload.jurisdiction || null, redirect_url: upload.redirect_url || null, notes: upload.notes || null, geojson: JSON.parse(upload.geojson), service_code_filters: upload.service_code_filters ?? [], road_name_filters: upload.road_name_filters ?? [] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geo-boundaries"] });
      setUpload({ name: "Primary Boundary", kind: "primary", jurisdiction: "", redirect_url: "", notes: "", geojson: "", service_code_filters: [], road_name_filters: [] });
    },
  });
  const googleMutation = useMutation({
    mutationFn: async () => client.post("/api/admin/geo-boundary/google", { query: google.query || undefined, place_id: google.place_id || undefined, name: google.name || undefined, kind: google.kind, jurisdiction: google.jurisdiction || undefined, redirect_url: google.redirect_url || undefined, notes: google.notes || undefined, service_code_filters: google.service_code_filters ?? [], road_name_filters: google.road_name_filters ?? [] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geo-boundaries"] });
      setGoogle({ query: "", place_id: "", name: "", kind: "primary", jurisdiction: "", redirect_url: "", notes: "", service_code_filters: [], road_name_filters: [] });
    },
  });
  const arcgisMutation = useMutation({
    mutationFn: async () => client.post("/api/admin/geo-boundary/arcgis", { layer_url: arcgis.layer_url, where: arcgis.where || undefined, name: arcgis.name || undefined, kind: arcgis.kind, jurisdiction: arcgis.jurisdiction || undefined, redirect_url: arcgis.redirect_url || undefined, notes: arcgis.notes || undefined, service_code_filters: arcgis.service_code_filters ?? [], road_name_filters: arcgis.road_name_filters ?? [] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["geo-boundaries"] });
      setArcgis({ layer_url: "", where: "", name: "ArcGIS Layer", kind: "primary", jurisdiction: "", redirect_url: "", notes: "", service_code_filters: [], road_name_filters: [] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => client.delete(`/api/admin/geo-boundary/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["geo-boundaries"] }),
  });
  const updateMutation = useMutation({
    mutationFn: async (boundary: any) => client.put(`/api/admin/geo-boundary/${boundary.id}`, {
      name: boundary.name,
      kind: boundary.kind,
      jurisdiction: boundary.jurisdiction ?? null,
      redirect_url: boundary.redirect_url ?? null,
      notes: boundary.notes ?? null,
      service_code_filters: boundary.service_code_filters ?? [],
      road_name_filters: boundary.road_name_filters ?? [],
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["geo-boundaries"] }),
    onError: (err: any) => {
      console.error("Boundary update failed", err?.response?.data || err);
      alert("Boundary update failed: " + (err?.response?.data?.detail || err.message || "Unknown error"));
    },
  });
  const boundaries = boundariesQuery.data ?? [];
  const primaryActive = boundaries.find((b: any) => b.kind === "primary" && b.is_active);
  const exclusions = boundaries.filter((b: any) => b.kind === "exclusion");
  const catExclusions = categoryExclusionsQuery.data ?? [];
  const roadExclusions = roadExclusionsQuery.data ?? [];
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Jurisdiction Boundaries</h1>
        <p className="text-sm text-slate-500">Control where requests are allowed and when to show helpful redirects.</p>
        <InfoBox title="How boundaries work">
          <ul className="list-disc pl-5">
            <li><strong>Primary</strong>: the allowed area (inside polygon). Outside → disallowed.</li>
            <li><strong>Exclusion</strong>: specific areas or roads to exclude. Outside primary still allowed, but matches here are blocked or warned.</li>
            <li><strong>Route filters</strong>: apply an exclusion only to selected categories (e.g., street lights).</li>
            <li><strong>Redirect URL</strong>: link users to the proper jurisdiction webpage when excluded.</li>
            <li>Use tabs below to add boundaries by GeoJSON, Google Maps, or specific road names.</li>
          </ul>
        </InfoBox>
      </div>
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="mb-3 flex gap-2">
          {(["primary","exclusions"] as const).map(t => (
            <button key={t} className={`rounded-full px-3 py-1 text-xs ${activeTab===t?"bg-slate-900 text-white":"border border-slate-200"}`} onClick={() => setActiveTab(t)}>{t === "primary" ? "Primary" : "Exclusions"}</button>
          ))}
        </div>
        {activeTab === "primary" && (
          <>
            <div className="mb-3 flex gap-2">
              {(["google","geojson","arcgis"] as const).map(m => (
                <button key={m} className={`rounded-full px-3 py-1 text-xs ${primaryMode===m?"bg-slate-900 text-white":"border border-slate-200"}`} onClick={() => setPrimaryMode(m)}>
                  {m === "google" ? "Google Maps (easy)" : m === "geojson" ? "GeoJSON (intermediate)" : "ArcGIS (advanced)"}
                </button>
              ))}
            </div>
            {primaryMode === "geojson" && (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600">Boundary Name<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={upload.name} onChange={(e) => setUpload((p) => ({ ...p, name: e.target.value }))} /></label>
          <label className="text-sm text-slate-600">Boundary Type<select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={upload.kind} onChange={(e) => setUpload((p) => ({ ...p, kind: e.target.value }))}><option value="primary">Primary (allowed)</option><option value="exclusion">Excluded jurisdiction</option></select></label>
          <label className="text-sm text-slate-600">Jurisdiction<select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={upload.jurisdiction} onChange={(e) => setUpload((p) => ({ ...p, jurisdiction: e.target.value }))}><option value="">Not specified</option><option value="township">Township</option><option value="county">County</option><option value="state">State</option><option value="federal">Federal</option><option value="other">Other</option></select></label>
          <label className="text-sm text-slate-600 md:col-span-2">Route categories<select multiple className="mt-1 h-32 w-full rounded-xl border border-slate-300 p-2" value={upload.service_code_filters} onChange={handleUploadFilters}>{categories.map((c) => (<option key={c.slug} value={c.slug}>{c.name}</option>))}</select></label>
          <label className="text-sm text-slate-600">Redirect URL<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={upload.redirect_url} onChange={(e) => setUpload((p) => ({ ...p, redirect_url: e.target.value }))} /></label>
          <label className="text-sm text-slate-600">Notes<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={upload.notes} onChange={(e) => setUpload((p) => ({ ...p, notes: e.target.value }))} /></label>
          <InfoBox title="GeoJSON format"><p>Provide a valid GeoJSON Polygon/FeatureCollection. Consider simplifying polygons to improve performance.</p></InfoBox>
          <label className="text-sm text-slate-600 md:col-span-2">GeoJSON<textarea className="mt-1 h-32 w-full rounded-xl border border-slate-300 p-2 font-mono text-xs" placeholder='{"type":"Polygon","coordinates":[...]}' value={upload.geojson} onChange={(e) => setUpload((p) => ({ ...p, geojson: e.target.value }))} /></label>
          <div className="md:col-span-2 flex justify-end"><button className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50" onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending}>{uploadMutation.isPending ? "Uploading…" : "Save Boundary"}</button></div>
        </div>
            )}
            {primaryMode === "google" && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600">Search phrase<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={google.query} onChange={(e) => setGoogle((p) => ({ ...p, query: e.target.value }))} /></label>
          <label className="text-sm text-slate-600">Place ID<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={google.place_id} onChange={(e) => setGoogle((p) => ({ ...p, place_id: e.target.value }))} /></label>
          <label className="text-sm text-slate-600">Override name<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={google.name} onChange={(e) => setGoogle((p) => ({ ...p, name: e.target.value }))} /></label>
          <label className="text-sm text-slate-600">Kind<select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={google.kind} onChange={(e) => setGoogle((p) => ({ ...p, kind: e.target.value }))}><option value="primary">Primary (allowed)</option><option value="exclusion">Excluded jurisdiction</option></select></label>
          <label className="text-sm text-slate-600">Jurisdiction<select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={google.jurisdiction} onChange={(e) => setGoogle((p) => ({ ...p, jurisdiction: e.target.value }))}><option value="">Not specified</option><option value="township">Township</option><option value="county">County</option><option value="state">State</option><option value="federal">Federal</option><option value="other">Other</option></select></label>
          <label className="text-sm text-slate-600 md:col-span-2">Route categories<select multiple className="mt-1 h-28 w-full rounded-xl border border-slate-300 p-2" value={google.service_code_filters} onChange={handleGoogleFilters}>{categories.map((c) => (<option key={c.slug} value={c.slug}>{c.name}</option>))}</select></label>
          <label className="text-sm text-slate-600">Redirect URL<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={google.redirect_url} onChange={(e) => setGoogle((p) => ({ ...p, redirect_url: e.target.value }))} /></label>
          <label className="text-sm text-slate-600">Notes<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={google.notes} onChange={(e) => setGoogle((p) => ({ ...p, notes: e.target.value }))} /></label>
          <div className="md:col-span-2 flex justify-end"><button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50" onClick={() => googleMutation.mutate()} disabled={googleMutation.isPending || !mapsApiKey}>{googleMutation.isPending ? "Importing…" : "Import from Google"}</button></div>
        </div>
            )}
            {primaryMode === "arcgis" && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600">Layer URL<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={arcgis.layer_url} onChange={(e) => setArcgis((p) => ({ ...p, layer_url: e.target.value }))} /></label>
          <label className="text-sm text-slate-600">Where (optional)<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={arcgis.where} onChange={(e) => setArcgis((p) => ({ ...p, where: e.target.value }))} /></label>
          <div className="md:col-span-2 flex justify-end"><button className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50" onClick={() => arcgisMutation.mutate()} disabled={arcgisMutation.isPending || !arcgis.layer_url}>{arcgisMutation.isPending ? "Importing…" : "Import ArcGIS Layer"}</button></div>
        </div>
            )}
          </>
        )}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700">Active Primary Boundary</h4>
          {primaryActive ? (
            <p className="text-sm text-slate-600">{primaryActive.name}</p>
          ) : (
            <p className="text-sm text-slate-500">None set. Use GeoJSON or Google tabs above to create one.</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-700">Exclusions</h4>
          {exclusions.length === 0 ? (
            <p className="text-sm text-slate-500">No exclusions yet. Use Road Names to add filters or import polygons.</p>
          ) : (
            <ul className="text-sm text-slate-600">
              {exclusions.map((b: any) => (
                <li key={b.id}>{b.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {activeTab === "exclusions" && (
      <div className="rounded-2xl border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-700">Exclude Categories</h4>
        <InfoBox><p>Redirect specific categories to an external provider with a helpful message.</p></InfoBox>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600">Category<select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={catForm.category_slug} onChange={(e) => setCatForm((p) => ({ ...p, category_slug: e.target.value }))}><option value="">Select category</option>{categories.map((c) => (<option key={c.slug} value={c.slug}>{c.name}</option>))}</select></label>
          <label className="text-sm text-slate-600">Redirect Name<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={catForm.redirect_name} onChange={(e) => setCatForm((p) => ({ ...p, redirect_name: e.target.value }))} /></label>
          <label className="text-sm text-slate-600">Redirect URL<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={catForm.redirect_url} onChange={(e) => setCatForm((p) => ({ ...p, redirect_url: e.target.value }))} /></label>
          <label className="text-sm text-slate-600 md:col-span-2">Message<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={catForm.redirect_message} onChange={(e) => setCatForm((p) => ({ ...p, redirect_message: e.target.value }))} /></label>
          <div className="md:col-span-2 flex justify-end"><button className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50" onClick={async () => { await client.post("/api/admin/exclusions/categories", { category_slug: catForm.category_slug, redirect_name: catForm.redirect_name || null, redirect_url: catForm.redirect_url || null, redirect_message: catForm.redirect_message || null, is_active: true }); queryClient.invalidateQueries({ queryKey: ["category-exclusions"] }); setCatForm({ category_slug: "", redirect_name: "", redirect_url: "", redirect_message: "", is_active: true }); }} disabled={!catForm.category_slug}>Save Exclusion</button></div>
        </div>
        <ul className="mt-4 space-y-2">
          {catExclusions.map((ex) => (
            <li key={ex.id} className="rounded-xl border border-slate-200 p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <select className="rounded-md border p-2" value={ex.category_slug} onChange={(e) => (ex.category_slug = e.target.value)}>
                  {categories.map((c) => (<option key={c.slug} value={c.slug}>{c.name}</option>))}
                </select>
                <input className="rounded-md border p-2" placeholder="Name" value={ex.redirect_name ?? ""} onChange={(e) => (ex.redirect_name = e.target.value)} />
                <input className="rounded-md border p-2" placeholder="URL" value={ex.redirect_url ?? ""} onChange={(e) => (ex.redirect_url = e.target.value)} />
                <input className="rounded-md border p-2 md:col-span-2" placeholder="Message" value={ex.redirect_message ?? ""} onChange={(e) => (ex.redirect_message = e.target.value)} />
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button className="rounded-full border border-slate-200 px-3 py-1 text-xs" onClick={async () => { await client.put(`/api/admin/exclusions/categories/${ex.id}`, { category_slug: ex.category_slug, redirect_name: ex.redirect_name || null, redirect_url: ex.redirect_url || null, redirect_message: ex.redirect_message || null, is_active: ex.is_active }); queryClient.invalidateQueries({ queryKey: ["category-exclusions"] }); }}>Save</button>
                <button className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50" onClick={async () => { await client.delete(`/api/admin/exclusions/categories/${ex.id}`); queryClient.invalidateQueries({ queryKey: ["category-exclusions"] }); }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <h4 className="text-sm font-semibold text-slate-700">Exclude Roads</h4>
          <InfoBox><p>Redirect requests on specific roads.</p></InfoBox>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-600">Road Name<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={roadForm.road_name} onChange={(e) => setRoadForm((p) => ({ ...p, road_name: e.target.value }))} /></label>
            <label className="text-sm text-slate-600">Redirect Name<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={roadForm.redirect_name} onChange={(e) => setRoadForm((p) => ({ ...p, redirect_name: e.target.value }))} /></label>
            <label className="text-sm text-slate-600">Redirect URL<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={roadForm.redirect_url} onChange={(e) => setRoadForm((p) => ({ ...p, redirect_url: e.target.value }))} /></label>
            <label className="text-sm text-slate-600 md:col-span-2">Message<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={roadForm.redirect_message} onChange={(e) => setRoadForm((p) => ({ ...p, redirect_message: e.target.value }))} /></label>
            <div className="md:col-span-2 flex justify-end"><button className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50" onClick={async () => { await client.post("/api/admin/exclusions/roads", { road_name: roadForm.road_name, redirect_name: roadForm.redirect_name || null, redirect_url: roadForm.redirect_url || null, redirect_message: roadForm.redirect_message || null, is_active: true }); queryClient.invalidateQueries({ queryKey: ["road-exclusions"] }); setRoadForm({ road_name: "", redirect_name: "", redirect_url: "", redirect_message: "", is_active: true }); }} disabled={!roadForm.road_name}>Save Exclusion</button></div>
          </div>
          <ul className="mt-4 space-y-2">
            {roadExclusions.map((ex) => (
              <li key={ex.id} className="rounded-xl border border-slate-200 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <input className="rounded-md border p-2" value={ex.road_name} onChange={(e) => (ex.road_name = e.target.value)} />
                  <input className="rounded-md border p-2" placeholder="Name" value={ex.redirect_name ?? ""} onChange={(e) => (ex.redirect_name = e.target.value)} />
                  <input className="rounded-md border p-2" placeholder="URL" value={ex.redirect_url ?? ""} onChange={(e) => (ex.redirect_url = e.target.value)} />
                  <input className="rounded-md border p-2 md:col-span-2" placeholder="Message" value={ex.redirect_message ?? ""} onChange={(e) => (ex.redirect_message = e.target.value)} />
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button className="rounded-full border border-slate-200 px-3 py-1 text-xs" onClick={async () => { await client.put(`/api/admin/exclusions/roads/${ex.id}`, { road_name: ex.road_name, redirect_name: ex.redirect_name || null, redirect_url: ex.redirect_url || null, redirect_message: ex.redirect_message || null, is_active: ex.is_active }); queryClient.invalidateQueries({ queryKey: ["road-exclusions"] }); }}>Save</button>
                  <button className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50" onClick={async () => { await client.delete(`/api/admin/exclusions/roads/${ex.id}`); queryClient.invalidateQueries({ queryKey: ["road-exclusions"] }); }}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      )}
      {boundaries.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {boundaries.map((boundary) => (
            <li key={boundary.id} className="rounded-xl border border-slate-200 p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <input className="rounded-md border p-2" value={boundary.name} onChange={(e) => (boundary.name = e.target.value)} />
                <select className="rounded-md border p-2" value={boundary.kind} onChange={(e) => (boundary.kind = e.target.value as any)}>
                  <option value="primary">Primary</option>
                  <option value="exclusion">Exclusion</option>
                </select>
                <select className="rounded-md border p-2" value={boundary.jurisdiction ?? ""} onChange={(e) => (boundary.jurisdiction = (e.target.value || null) as any)}>
                  <option value="">Not specified</option>
                  <option value="township">Township</option>
                  <option value="county">County</option>
                  <option value="state">State</option>
                  <option value="federal">Federal</option>
                  <option value="other">Other</option>
                </select>
                <input className="rounded-md border p-2" value={boundary.redirect_url ?? ""} onChange={(e) => (boundary.redirect_url = e.target.value)} placeholder="Redirect URL" />
                <input className="rounded-md border p-2 md:col-span-2" value={boundary.notes ?? ""} onChange={(e) => (boundary.notes = e.target.value)} placeholder="Notes" />
                <select multiple className="rounded-md border p-2 md:col-span-2" value={boundary.service_code_filters ?? []} onChange={(e) => { const selected = Array.from(e.target.selectedOptions).map((o) => o.value); boundary.service_code_filters = selected; }}>
                  {categories.map((c) => (<option key={c.slug} value={c.slug}>{c.name}</option>))}
                </select>
                <label className="text-sm text-slate-600 md:col-span-2">Road filters (one per line)<textarea className="mt-1 h-20 w-full rounded-xl border border-slate-300 p-2 font-mono text-xs" value={(boundary.road_name_filters ?? []).join("\n")} onChange={(e) => (boundary.road_name_filters = e.target.value.split(/\n+/).map(s => s.trim()).filter(Boolean))} /></label>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button className="rounded-full border border-slate-200 px-3 py-1 text-xs" onClick={() => updateMutation.mutate({ ...boundary })} disabled={updateMutation.isPending}>Save</button>
                <button type="button" className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50" onClick={() => deleteMutation.mutate(boundary.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
