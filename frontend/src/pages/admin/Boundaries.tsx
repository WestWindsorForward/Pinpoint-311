import { useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../../api/client";
import { useAdminCategories, useBoundaries, useResidentConfig } from "../../api/hooks";
import type { IssueCategory } from "../../types";
import { useMemo, useState } from "react";
import InfoBox from "../../components/InfoBox";

export function BoundariesPage() {
  const queryClient = useQueryClient();
  const boundariesQuery = useBoundaries();
  const adminCategoriesQuery = useAdminCategories();
  const { data: residentConfig } = useResidentConfig();
  const [activeTab, setActiveTab] = useState<"geojson" | "google" | "roads">("geojson");
  const [upload, setUpload] = useState({ name: "Primary Boundary", kind: "primary", jurisdiction: "", redirect_url: "", notes: "", geojson: "", service_code_filters: [] as string[], road_name_filters: [] as string[] });
  const [google, setGoogle] = useState({ query: "", place_id: "", name: "", kind: "primary", jurisdiction: "", redirect_url: "", notes: "", service_code_filters: [] as string[], road_name_filters: [] as string[] });
  const [arcgis, setArcgis] = useState({ layer_url: "", where: "", name: "ArcGIS Layer", kind: "primary", jurisdiction: "", redirect_url: "", notes: "", service_code_filters: [] as string[], road_name_filters: [] as string[] });
  const mapsApiKey = residentConfig?.integrations?.google_maps_api_key;
  const categories = useMemo<IssueCategory[]>(() => residentConfig?.categories ?? adminCategoriesQuery.data ?? [], [residentConfig, adminCategoriesQuery.data]);
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
          {(["geojson","google","roads"] as const).map(t => (
            <button key={t} className={`rounded-full px-3 py-1 text-xs ${activeTab===t?"bg-slate-900 text-white":"border border-slate-200"}`} onClick={() => setActiveTab(t)}>{t === "geojson" ? "GeoJSON" : t === "google" ? "Google Maps" : "Road Names"}</button>
          ))}
        </div>
        {activeTab === "geojson" && (
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
      </div>
      {activeTab === "google" && (
      <div className="rounded-2xl border border-slate-200 p-4">
        <InfoBox title="Google Maps import"><p>Search a jurisdiction or paste a Place ID to import its polygon. Requires Google Maps API key in Runtime Config.</p></InfoBox>
        <div className="flex items-center justify-between"><div><h4 className="text-sm font-semibold text-slate-700">Import from Google Maps</h4><p className="text-xs text-slate-500">Requires a Google Maps API key in Runtime Config.</p></div></div>
        {!mapsApiKey && (<p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">Add a Google Maps API key under Runtime Config to enable this importer.</p>)}
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
      </div>
      )}
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
      {activeTab === "roads" && (
      <div className="rounded-2xl border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-700">Create Road Name Filters</h4>
        <InfoBox><p>List specific road names to include/exclude. If type is <strong>Exclusion</strong>, matching requests will be excluded (or warned if the category is not in filters).</p></InfoBox>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600">Boundary Name<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={upload.name} onChange={(e) => setUpload((p) => ({ ...p, name: e.target.value }))} /></label>
          <label className="text-sm text-slate-600">Boundary Type<select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={upload.kind} onChange={(e) => setUpload((p) => ({ ...p, kind: e.target.value }))}><option value="primary">Primary</option><option value="exclusion">Exclusion</option></select></label>
          <label className="text-sm text-slate-600">Jurisdiction<select className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={upload.jurisdiction} onChange={(e) => setUpload((p) => ({ ...p, jurisdiction: e.target.value }))}><option value="">Not specified</option><option value="township">Township</option><option value="county">County</option><option value="state">State</option><option value="federal">Federal</option><option value="other">Other</option></select></label>
          <label className="text-sm text-slate-600 md:col-span-2">Route categories<select multiple className="mt-1 h-28 w-full rounded-xl border border-slate-300 p-2" value={upload.service_code_filters} onChange={handleUploadFilters}>{categories.map((c) => (<option key={c.slug} value={c.slug}>{c.name}</option>))}</select></label>
          <label className="text-sm text-slate-600 md:col-span-2">Road names (one per line)<textarea className="mt-1 h-24 w-full rounded-xl border border-slate-300 p-2 font-mono text-xs" placeholder={"County Road 571\nMain Street\nUS-1"} value={upload.road_name_filters.join("\n")} onChange={(e) => setUpload((p) => ({ ...p, road_name_filters: e.target.value.split(/\n+/).map(s => s.trim()).filter(Boolean) }))} /></label>
          <div className="md:col-span-2 flex justify-end"><button className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-50" onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending}>{uploadMutation.isPending ? "Saving…" : "Save Road Filter"}</button></div>
        </div>
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-700">Import ArcGIS Feature Layer</h4>
          <InfoBox><p>Paste the ArcGIS Feature Layer URL. We will query polygon features and store them as GeoJSON.</p></InfoBox>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-600">Layer URL<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={arcgis.layer_url} onChange={(e) => setArcgis((p) => ({ ...p, layer_url: e.target.value }))} /></label>
            <label className="text-sm text-slate-600">Where (optional)<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={arcgis.where} onChange={(e) => setArcgis((p) => ({ ...p, where: e.target.value }))} /></label>
            <div className="md:col-span-2 flex justify-end"><button className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50" onClick={() => arcgisMutation.mutate()} disabled={arcgisMutation.isPending || !arcgis.layer_url}>{arcgisMutation.isPending ? "Importing…" : "Import ArcGIS Layer"}</button></div>
          </div>
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
