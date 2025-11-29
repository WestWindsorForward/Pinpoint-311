import { useResidentConfig } from "../../api/hooks";

export function OverviewPage() {
  const { data } = useResidentConfig();
  const branding = data?.branding ?? {};
  const categories = data?.categories ?? [];
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-slate-500">Snapshot of portal and configuration.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Town name</p>
          <p className="text-lg font-semibold">{branding.town_name ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Site title</p>
          <p className="text-lg font-semibold">{branding.site_title ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Published categories</p>
          <p className="text-lg font-semibold">{categories.length}</p>
        </div>
      </div>
    </div>
  );
}

