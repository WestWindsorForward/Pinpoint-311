import { NavLink } from "react-router-dom";

export function StubPage({ title, to }: { title: string; to: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-slate-600">This section will be migrated next. Use the legacy console for full controls.</p>
      <NavLink to={to} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
        Open legacy Admin Console
      </NavLink>
    </div>
  );
}

