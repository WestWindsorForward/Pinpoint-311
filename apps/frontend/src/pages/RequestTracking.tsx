import { FormEvent, useState } from "react";
import { useLocation } from "react-router-dom";

import { apiClient } from "../api/client";
import { ResidentRequestDetail } from "../api/types";

export default function RequestTracking() {
  const location = useLocation();
  const [requestId, setRequestId] = useState<string>((location.state as { requestId?: string })?.requestId ?? "");
  const [result, setResult] = useState<ResidentRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    if (!requestId) return;
    setError(null);
    setLoading(true);
    try {
      const { data } = await apiClient.get<ResidentRequestDetail>(`/resident/requests/${requestId.trim()}`);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError("Request ID not found. Please check the code and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ padding: "48px 0", display: "grid", gap: "24px" }}>
      <form className="card" onSubmit={lookup} style={{ display: "grid", gap: "16px" }}>
        <h2>Track a Request</h2>
        <p>Enter the 8-character request ID included in your confirmation.</p>
        <input
          placeholder="e.g. 4F7A21BC"
          value={requestId}
          onChange={(event) => setRequestId(event.target.value.toUpperCase())}
          required
        />
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Searching..." : "Check Status"}
        </button>
        {error && <span style={{ color: "#b91c1c" }}>{error}</span>}
      </form>

      {result && (
        <section className="card" style={{ display: "grid", gap: "16px" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Request {result.public_id}</h3>
            <span className={`status-pill ${result.status}`}>{result.status.replace("_", " ")}</span>
          </header>
          <div>
            <strong>Title:</strong> {result.title}
          </div>
          <div>
            <strong>Submitted:</strong> {new Date(result.created_at).toLocaleString()}
          </div>
          <div>
            <strong>Priority:</strong> {result.priority.toUpperCase()}
          </div>
          {result.public_notes.length > 0 && (
            <section>
              <h4>Public updates</h4>
              <div style={{ display: "grid", gap: "12px" }}>
                {result.public_notes.map((note, index) => (
                  <div key={index} style={{ background: "#f8fafc", padding: "12px", borderRadius: "12px" }}>
                    <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                      {new Date(note.created_at).toLocaleString()}
                    </span>
                    <p style={{ marginTop: "4px" }}>{note.body}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section>
            <h4>Timeline</h4>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "12px" }}>
              {result.timeline.map((entry, index) => (
                <li key={index} style={{ borderLeft: "3px solid #0c6bd6", paddingLeft: "12px" }}>
                  <div style={{ fontWeight: 600 }}>{entry.status.replace("_", " ")}</div>
                  <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                    {new Date(entry.timestamp).toLocaleString()}
                    {entry.changed_by ? ` ? ${entry.changed_by}` : ""}
                  </div>
                  {entry.note && <p style={{ marginTop: "4px" }}>{entry.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </section>
      )}
    </div>
  );
}
