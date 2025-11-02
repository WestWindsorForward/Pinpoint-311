import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import {
  Attachment,
  AttachmentType,
  NoteVisibility,
  RequestAssignmentUpdate,
  RequestNoteCreate,
  RequestPriority,
  RequestStatus,
  StaffRequestDetail
} from "../../api/types";

const STATUS_OPTIONS: RequestStatus[] = ["new", "in_progress", "resolved", "closed"];
const PRIORITY_OPTIONS: RequestPriority[] = ["low", "medium", "high", "emergency"];
const VISIBILITY_OPTIONS: NoteVisibility[] = ["public", "internal"];

export default function StaffRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [request, setRequest] = useState<StaffRequestDetail | null>(null);
  const [statusUpdate, setStatusUpdate] = useState<RequestStatus>("in_progress");
  const [statusNote, setStatusNote] = useState("");
  const [priority, setPriority] = useState<RequestPriority>("medium");
  const [department, setDepartment] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<NoteVisibility>("public");
  const [noteBody, setNoteBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await apiClient.get<StaffRequestDetail>(`/staff/requests/${id}`);
        setRequest(data);
        setStatusUpdate(data.status);
        setPriority(data.priority);
        setDepartment(data.assigned_department ?? "");
      } catch (err) {
        setError("Unable to load request details");
      }
    }
    if (id) void load();
  }, [id]);

  async function refresh() {
    if (!id) return;
    const { data } = await apiClient.get<StaffRequestDetail>(`/staff/requests/${id}`);
    setRequest(data);
  }

  async function submitStatus(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    await apiClient.patch(`/staff/requests/${id}/status`, { status: statusUpdate, note: statusNote });
    setStatusNote("");
    await refresh();
  }

  async function submitPriority(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    await apiClient.patch(`/staff/requests/${id}/priority`, { priority });
    await refresh();
  }

  async function submitAssignment(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    const payload: RequestAssignmentUpdate = {
      assigned_department: department || null,
      assigned_to_id: null
    };
    await apiClient.patch(`/staff/requests/${id}/assignment`, payload);
    await refresh();
  }

  async function submitNote(event: FormEvent) {
    event.preventDefault();
    if (!id || !noteBody) return;
    const payload: RequestNoteCreate = { visibility: noteVisibility, body: noteBody };
    await apiClient.post(`/staff/requests/${id}/notes`, payload);
    setNoteBody("");
    await refresh();
  }

  async function uploadAttachment(event: ChangeEvent<HTMLInputElement>, type: AttachmentType) {
    if (!id || !event.target.files?.[0]) return;
    const formData = new FormData();
    formData.append("file", event.target.files[0]);
    await apiClient.post(`/staff/requests/${id}/attachments`, formData, {
      params: { attachment_type: type },
      headers: { "Content-Type": "multipart/form-data" }
    });
    event.target.value = "";
    await refresh();
  }

  if (!request) {
    return (
      <div className="container" style={{ padding: "48px 0" }}>
        {error ? <div className="card">{error}</div> : <div className="card">Loading request...</div>}
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: "48px 0", display: "grid", gap: "24px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Request {request.public_id}</h2>
          <p style={{ margin: 0, color: "#6b7280" }}>{request.title}</p>
        </div>
        <span className={`status-pill ${request.status}`}>{request.status.replace("_", " ")}</span>
      </header>

      <section className="card" style={{ display: "grid", gap: "12px" }}>
        <div><strong>Priority:</strong> {request.priority.toUpperCase()}</div>
        <div><strong>Category:</strong> {request.category_code ?? "?"}</div>
        <div><strong>Department:</strong> {request.assigned_department ?? "Unassigned"}</div>
        <div><strong>Submitted:</strong> {new Date(request.created_at).toLocaleString()}</div>
        <div><strong>Submitter:</strong> {request.submitter_name ?? "Anonymous"}</div>
        <div><strong>Contact:</strong> {request.submitter_email ?? "?"} / {request.submitter_phone ?? "?"}</div>
        <div><strong>Address:</strong> {request.location_address ?? "?"}</div>
        <p>{request.description}</p>
      </section>

      <section className="card" style={{ display: "grid", gap: "16px" }}>
        <h3>Update Status</h3>
        <form onSubmit={submitStatus} style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
          <div>
            <label>Status</label>
            <select value={statusUpdate} onChange={(event) => setStatusUpdate(event.target.value as RequestStatus)}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Note (optional)</label>
            <input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Add context for this change" />
          </div>
          <button className="primary-button" type="submit">
            Save Status
          </button>
        </form>
      </section>

      <section className="card" style={{ display: "grid", gap: "16px" }}>
        <h3>Priority & Assignment</h3>
        <form onSubmit={submitPriority} style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label>Priority</label>
            <select value={priority} onChange={(event) => setPriority(event.target.value as RequestPriority)}>
              {PRIORITY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <button className="secondary-button" type="submit">
            Update Priority
          </button>
        </form>
        <form onSubmit={submitAssignment} style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label>Assigned Department</label>
            <input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Road Maintenance" />
          </div>
          <button className="secondary-button" type="submit">
            Save Assignment
          </button>
        </form>
      </section>

      <section className="card" style={{ display: "grid", gap: "16px" }}>
        <h3>Add Note</h3>
        <form onSubmit={submitNote} style={{ display: "grid", gap: "12px" }}>
          <div>
            <label>Visibility</label>
            <select value={noteVisibility} onChange={(event) => setNoteVisibility(event.target.value as NoteVisibility)}>
              {VISIBILITY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <textarea rows={4} value={noteBody} onChange={(event) => setNoteBody(event.target.value)} required />
          <button className="secondary-button" type="submit">
            Add Note
          </button>
        </form>
        <div style={{ display: "grid", gap: "12px" }}>
          {request.notes.map((note) => (
            <div key={note.id} style={{ background: note.visibility === "public" ? "#ecfdf5" : "#f1f5f9", padding: "12px", borderRadius: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#6b7280" }}>
                <span>{note.visibility.toUpperCase()}</span>
                <span>{new Date(note.created_at).toLocaleString()}</span>
              </div>
              <p style={{ marginTop: "8px" }}>{note.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ display: "grid", gap: "16px" }}>
        <h3>Attachments</h3>
        <label className="secondary-button" style={{ display: "inline-flex", cursor: "pointer", alignItems: "center", gap: "8px" }}>
          Upload completion photo
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(event) => uploadAttachment(event, "completion")}
          />
        </label>
        <div style={{ display: "grid", gap: "12px" }}>
          {request.attachments.map((attachment) => (
            <AttachmentRow key={attachment.id} attachment={attachment} />
          ))}
          {request.attachments.length === 0 && <span style={{ color: "#6b7280" }}>No attachments uploaded.</span>}
        </div>
      </section>

      <section className="card" style={{ display: "grid", gap: "16px" }}>
        <h3>History</h3>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "12px" }}>
          {request.history.map((item, index) => (
            <li key={index} style={{ borderLeft: "3px solid #0c6bd6", paddingLeft: "12px" }}>
              <div style={{ fontWeight: 600 }}>{item.to_status.replace("_", " ")}</div>
              <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                {new Date(item.created_at).toLocaleString()}
                {item.changed_by ? ` ? ${item.changed_by.full_name ?? item.changed_by.email}` : ""}
              </div>
              {item.note && <p style={{ marginTop: "4px" }}>{item.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function AttachmentRow({ attachment }: { attachment: Attachment }) {
  const uploadsBase = "/uploads";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 600 }}>{attachment.label ?? attachment.file_type.toUpperCase()}</div>
        <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          {new Date(attachment.created_at).toLocaleString()}
        </div>
      </div>
      <a className="secondary-button" href={`${uploadsBase}/${attachment.file_path}`} target="_blank" rel="noreferrer">
        View
      </a>
    </div>
  );
}
