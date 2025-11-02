import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiClient } from "../api/client";
import { IssueCategory, NotificationMethod, TownshipConfigResponse } from "../api/types";
import MapPicker from "../components/MapPicker";

interface Props {
  config: TownshipConfigResponse;
}

interface FormState {
  title: string;
  description: string;
  category_code: string;
  location_address: string;
  location_lat: number | null;
  location_lng: number | null;
  submitter_name: string;
  submitter_email: string;
  submitter_phone: string;
  notify_email: boolean;
  notify_sms: boolean;
  sms_number: string;
  attachment?: File | null;
}

const INITIAL_STATE: FormState = {
  title: "",
  description: "",
  category_code: "",
  location_address: "",
  location_lat: null,
  location_lng: null,
  submitter_name: "",
  submitter_email: "",
  submitter_phone: "",
  notify_email: true,
  notify_sms: false,
  sms_number: "",
  attachment: null
};

const steps = ["Issue Details", "Location", "Contact & Notifications", "Review & Submit"];

export default function ResidentRequestForm({ config }: Props) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<FormState>(INITIAL_STATE);
  const [jurisdictionWarning, setJurisdictionWarning] = useState<string | null>(null);
  const [jurisdictionExternal, setJurisdictionExternal] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const navigate = useNavigate();

  const categories = useMemo<IssueCategory[]>(() => config.issue_categories ?? [], [config.issue_categories]);

  useEffect(() => {
    async function fetchJurisdiction() {
      if (!state.location_address) {
        setJurisdictionWarning(null);
        return;
      }
      try {
        const { data } = await apiClient.get<{ jurisdiction: string | null; message?: string | null; is_external: boolean }>(
          "/resident/jurisdiction",
          { params: { address: state.location_address } }
        );
        setJurisdictionWarning(data.message ?? null);
        setJurisdictionExternal(data.is_external);
      } catch (err) {
        setJurisdictionWarning(null);
      }
    }

    const debounce = setTimeout(fetchJurisdiction, 500);
    return () => clearTimeout(debounce);
  }, [state.location_address]);

  if (requestId) {
    return (
      <div className="container" style={{ padding: "64px 0", display: "grid", gap: "24px" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <h2>Request Submitted</h2>
          <p>
            Thank you! Your request ID is <strong>{requestId}</strong>. Keep this ID handy to check status updates.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "16px" }}>
            <button className="primary-button" onClick={() => navigate("/track", { state: { requestId } })}>
              Track This Request
            </button>
            <button className="secondary-button" onClick={() => { setState(INITIAL_STATE); setStep(0); setRequestId(null); }}>
              Submit Another Request
            </button>
          </div>
        </div>
      </div>
    );
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const notifications: Array<{ method: NotificationMethod; target: string }> = [];
    if (state.notify_email && state.submitter_email) {
      notifications.push({ method: "email", target: state.submitter_email });
    }
    if (state.notify_sms && state.sms_number) {
      notifications.push({ method: "sms", target: state.sms_number });
    }

    const payload = {
      title: state.title,
      description: state.description,
      category_code: state.category_code || null,
      location_address: state.location_address,
      location_lat: state.location_lat,
      location_lng: state.location_lng,
      submitter_name: state.submitter_name,
      submitter_email: state.submitter_email,
      submitter_phone: state.submitter_phone,
      notifications
    };

    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    if (state.attachment) {
      formData.append("initial_photo", state.attachment);
    }

    setLoading(true);
    try {
      const { data } = await apiClient.post<{ public_id: string }>("/resident/requests", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setRequestId(data.public_id);
    } catch (err) {
      setError("Unable to submit the request. Please verify all fields and try again.");
    } finally {
      setLoading(false);
    }
  }

  function nextStep() {
    if (step < steps.length - 1) setStep(step + 1);
  }

  function prevStep() {
    if (step > 0) setStep(step - 1);
  }

  return (
    <div className="container" style={{ padding: "48px 0", display: "grid", gap: "24px" }}>
      <div className="step-indicator">
        {steps.map((label, index) => (
          <span key={label} className={index === step ? "active" : undefined}>{index + 1}</span>
        ))}
      </div>

      <form className="card" onSubmit={handleSubmit} style={{ display: "grid", gap: "24px" }}>
        {step === 0 && (
          <section style={{ display: "grid", gap: "16px" }}>
            <div>
              <label htmlFor="title">Issue Title</label>
              <input
                id="title"
                value={state.title}
                onChange={(event) => updateField("title", event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="description">Describe the issue</label>
              <textarea
                id="description"
                rows={6}
                value={state.description}
                onChange={(event) => updateField("description", event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="category">Category</label>
              <select
                id="category"
                value={state.category_code}
                onChange={(event) => updateField("category_code", event.target.value)}
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.code} value={category.code}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {step === 1 && (
          <section style={{ display: "grid", gap: "16px" }}>
            <div>
              <label htmlFor="address">Street address or nearby landmark</label>
              <input
                id="address"
                value={state.location_address}
                onChange={(event) => updateField("location_address", event.target.value)}
                placeholder="123 Main Street, West Windsor NJ"
                required
              />
            </div>
            <MapPicker
              latitude={state.location_lat}
              longitude={state.location_lng}
              onChange={(lat, lng) => {
                updateField("location_lat", lat);
                updateField("location_lng", lng);
              }}
            />
            <small style={{ color: "#4b5563" }}>
              Click the map to drop a pin. Latitude/Longitude: {state.location_lat?.toFixed(4) ?? "?"} / {state.location_lng?.toFixed(4) ?? "?"}
            </small>
            {jurisdictionWarning && (
              <div className="card" style={{ background: jurisdictionExternal ? "#fee2e2" : "#dcfce7" }}>
                <strong>{jurisdictionExternal ? "Jurisdiction reminder" : "Triage note"}</strong>
                <p>{jurisdictionWarning}</p>
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section style={{ display: "grid", gap: "16px" }}>
            <div>
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                value={state.submitter_name}
                onChange={(event) => updateField("submitter_name", event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={state.submitter_email}
                onChange={(event) => updateField("submitter_email", event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                value={state.submitter_phone}
                onChange={(event) => updateField("submitter_phone", event.target.value)}
              />
            </div>

            <div style={{ display: "grid", gap: "8px" }}>
              <label>Notification options</label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={state.notify_email}
                  onChange={(event) => updateField("notify_email", event.target.checked)}
                />
                Email updates
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={state.notify_sms}
                  onChange={(event) => updateField("notify_sms", event.target.checked)}
                />
                SMS text message
              </label>
              {state.notify_sms && (
                <input
                  placeholder="SMS number"
                  value={state.sms_number}
                  onChange={(event) => updateField("sms_number", event.target.value)}
                  required
                />
              )}
            </div>
          </section>
        )}

        {step === 3 && (
          <section style={{ display: "grid", gap: "16px" }}>
            <div>
              <label htmlFor="attachment">Upload a photo (optional)</label>
              <input
                id="attachment"
                type="file"
                accept="image/*"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateField("attachment", event.target.files?.[0] ?? null)
                }
              />
            </div>
            <div className="card" style={{ background: "#f8fafc" }}>
              <h3>Review your submission</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "8px" }}>
                <li><strong>Title:</strong> {state.title || "?"}</li>
                <li><strong>Category:</strong> {categories.find((c) => c.code === state.category_code)?.label ?? "Unspecified"}</li>
                <li><strong>Address:</strong> {state.location_address || "?"}</li>
                <li><strong>Notifications:</strong> {state.notify_email ? "Email" : "No email"} {state.notify_sms ? "& SMS" : ""}</li>
              </ul>
            </div>
            {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? "Submitting..." : "Submit Request"}
            </button>
          </section>
        )}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {step > 0 ? (
            <button type="button" className="secondary-button" onClick={prevStep}>
              Back
            </button>
          ) : (
            <span />
          )}
          {step < steps.length - 1 && (
            <button type="button" className="primary-button" onClick={nextStep}>
              Next
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
