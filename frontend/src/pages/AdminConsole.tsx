import { AdminPanel } from "../components/AdminPanel";

export function AdminConsole() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Township Settings</h1>
        <p className="text-slate-500">Live branding, categories, and secrets configuration.</p>
      </div>
      <AdminPanel />
    </div>
  );
}
