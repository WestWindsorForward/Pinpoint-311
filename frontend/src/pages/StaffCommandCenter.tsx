import { StaffDashboard } from "../components/StaffDashboard";

export function StaffCommandCenter() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Unified Inbox</h1>
        <p className="text-slate-500">Live feed of resident requests with AI decision support.</p>
      </div>
      <StaffDashboard />
    </div>
  );
}
