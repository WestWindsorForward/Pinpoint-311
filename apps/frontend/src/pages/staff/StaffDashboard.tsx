import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiClient } from "../../api/client";
import { DashboardSummary } from "../../api/types";
import { useAuthStore } from "../../store/auth";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed"
};

type StatusKey = keyof typeof STATUS_LABELS;

export default function StaffDashboard() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await apiClient.get<DashboardSummary>("/staff/dashboard");
        setSummary(data);
      } catch (err) {
        setError("Unable to load dashboard metrics");
      }
    }
    void load();
  }, []);

  return (
    <div className="container" style={{ padding: "48px 0", display: "grid", gap: "24px" }}>
      <header className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Township Staff Dashboard</h2>
          {user && (
            <p style={{ margin: "4px 0", color: "#6b7280" }}>
              Signed in as {user.full_name ?? user.email} ({user.role})
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <Link to="/staff/requests" className="primary-button">
            Manage Requests
          </Link>
          <button className="secondary-button" onClick={logout}>
            Sign Out
          </button>
        </div>
      </header>

      <section className="card" style={{ display: "grid", gap: "16px" }}>
        <h3>Request Overview</h3>
        {error && <span style={{ color: "#b91c1c" }}>{error}</span>}
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {Object.entries(STATUS_LABELS).map(([key, label]) => {
            const count = summary?.summary?.[key as StatusKey] ?? 0;
            return (
            <div key={key} style={{ background: "#f1f5f9", padding: "16px", borderRadius: "12px" }}>
              <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>{label}</div>
                <div style={{ fontSize: "2rem", fontWeight: 700 }}>{count}</div>
            </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3>Quick Actions</h3>
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "12px" }}>
          <li>
            <Link to="/staff/requests" style={{ color: "#0c6bd6" }}>
              View and triage incoming requests
            </Link>
          </li>
          <li>
            <Link to="/staff/requests?status=in_progress" style={{ color: "#0c6bd6" }}>
              Review in-progress tasks
            </Link>
          </li>
          <li>
            <Link to="/staff/requests?status=resolved" style={{ color: "#0c6bd6" }}>
              Close out resolved issues with completion photos
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
