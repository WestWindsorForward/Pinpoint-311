import { NavLink } from "react-router-dom";

export function AdminConsole() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Legacy Admin Console</h1>
        <p className="text-slate-500">A redesigned admin is now available.</p>
      </div>
      <NavLink to="/admin/overview" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
        Open new Admin Portal
      </NavLink>
    </div>
  );
}
