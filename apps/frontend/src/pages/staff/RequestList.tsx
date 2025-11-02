import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import { RequestPriority, RequestStatus, StaffRequestListItem } from "../../api/types";

const STATUSES: RequestStatus[] = ["new", "in_progress", "resolved", "closed"];
const PRIORITIES: RequestPriority[] = ["low", "medium", "high", "emergency"];

export default function StaffRequestList() {
  const [params, setParams] = useSearchParams();
  const [requests, setRequests] = useState<StaffRequestListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const statusFilter = (params.get("status") as RequestStatus | null) ?? null;
  const priorityFilter = (params.get("priority") as RequestPriority | null) ?? null;

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await apiClient.get<StaffRequestListItem[]>("/staff/requests", {
          params: {
            status_filter: statusFilter ?? undefined,
            priority_filter: priorityFilter ?? undefined
          }
        });
        setRequests(data);
      } catch (err) {
        setError("Unable to load requests");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [statusFilter, priorityFilter]);

  async function exportCsv() {
    const response = await apiClient.get("/staff/requests/export", {
      params: { status_filter: statusFilter ?? undefined },
      responseType: "text"
    });
    const blob = new Blob([response.data], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `requests_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  return (
    <div className="container" style={{ padding: "48px 0", display: "grid", gap: "24px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Service Requests</h2>
        <div style={{ display: "flex", gap: "12px" }}>
          <button className="secondary-button" onClick={exportCsv}>
            Export CSV
          </button>
          <Link to="/staff/dashboard" className="secondary-button">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <section className="card" style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <label>Status</label>
            <select value={statusFilter ?? ""} onChange={(event) => updateFilter("status", event.target.value)}>
              <option value="">All</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Priority</label>
            <select value={priorityFilter ?? ""} onChange={(event) => updateFilter("priority", event.target.value)}>
              <option value="">All</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div>Loading requests...</div>
        ) : error ? (
          <div style={{ color: "#b91c1c" }}>{error}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                  <th>Request ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Department</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td>
                      <Link to={`/staff/requests/${request.id}`} style={{ color: "#0c6bd6" }}>
                        {request.public_id}
                      </Link>
                    </td>
                    <td>{request.title}</td>
                    <td>{request.status.replace("_", " ")}</td>
                    <td>{request.priority.toUpperCase()}</td>
                    <td>{request.assigned_department ?? "?"}</td>
                    <td>{new Date(request.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {requests.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}>
                      No requests found for the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
