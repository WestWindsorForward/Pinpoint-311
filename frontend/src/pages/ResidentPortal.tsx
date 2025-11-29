import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import client from "../api/client";
import { useRecentRequests, useResidentConfig } from "../api/hooks";
import type { RequestAttachment, RequestUpdate, ServiceRequest } from "../types";
import { BrandingProvider } from "../components/BrandingProvider";
import { Hero } from "../components/Hero";
import { RequestForm } from "../components/RequestForm";
import { useAuthStore } from "../store/auth";

export function ResidentPortal() {
  const { data, isLoading } = useResidentConfig();
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRequestId = searchParams.get("request") ?? "";

  if (user && user.role !== "resident") {
    return <Navigate to={user.role === "admin" ? "/admin" : "/staff"} replace />;
  }

  if (isLoading || !data) {
    return <div className="animate-pulse rounded-3xl bg-white/60 p-10" />;
  }

  return (
    <BrandingProvider branding={data.branding}>
      <div className="space-y-8">
        <Hero />
        <section className="grid gap-6 lg:grid-cols-2">
          <RequestForm
            categories={Array.isArray(data.categories) ? data.categories : []}
            mapsApiKey={data.integrations?.google_maps_api_key ?? null}
          />
          <div className="space-y-6">
            <RequestTracker
              initialRequestId={initialRequestId}
              onTrack={(externalId) =>
                externalId ? setSearchParams({ request: externalId }) : setSearchParams({})
              }
            />
            <RecentRequestsPanel onShareRequest={(externalId) => setSearchParams({ request: externalId })} />
          </div>
        </section>
      </div>
    </BrandingProvider>
  );
}

function RecentRequestsPanel({ onShareRequest }: { onShareRequest: (externalId: string) => void }) {
  const { data, isLoading } = useRecentRequests();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="rounded-2xl bg-white/80 p-6 shadow">
      <h2 className="text-xl font-semibold">Most recent requests</h2>
      {isLoading ? (
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : data && data.length > 0 ? (
        <div className="mt-4 space-y-3">
          {data.map((request) => (
            <motion.div
              key={request.id}
              layout
              className="cursor-pointer rounded-xl border border-slate-200 p-4 hover:border-slate-300"
              onClick={() => setExpanded((prev) => (prev === request.id ? null : request.id))}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">{request.external_id}</p>
                  <p className="text-sm text-slate-700">{request.description}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase text-slate-600">
                  {request.status}
                </span>
              </div>
              {expanded === request.id && (
                <RequestDetails
                  request={request}
                  isCompact
                  showDownloads
                  onCopyLink={(externalId) => onShareRequest(externalId)}
                />
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">No requests yet.</p>
      )}
    </section>
  );
}

function RequestTracker({
  initialRequestId = "",
  onTrack,
}: {
  initialRequestId?: string;
  onTrack?: (externalId: string) => void;
}) {
  const [requestId, setRequestId] = useState(initialRequestId);
  const [result, setResult] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastPrefill = useRef<string | null>(null);

  const lookup = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter a request ID.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await client.get<ServiceRequest>(`/api/resident/requests/${trimmed}`);
      setResult(data);
      onTrack?.(data.external_id);
    } catch (err) {
      setResult(null);
      setError("Request not found. Double-check the ID from your confirmation email.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!initialRequestId || initialRequestId === lastPrefill.current) {
      return;
    }
    lastPrefill.current = initialRequestId;
    setRequestId(initialRequestId);
    lookup(initialRequestId);
  }, [initialRequestId]);

  return (
    <section className="rounded-2xl bg-white/80 p-6 shadow">
      <h2 className="text-xl font-semibold">Track a request</h2>
      <p className="text-sm text-slate-500">
        Enter the request ID from your confirmation email to see live updates.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-slate-300 p-2"
          placeholder="e.g. SR-20250101-abc123"
          value={requestId}
          onChange={(event) => setRequestId(event.target.value)}
        />
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          onClick={() => lookup(requestId)}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Lookup"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {result && (
        <div className="mt-4">
          <RequestDetails request={result} showDownloads onCopyLink={(externalId) => onTrack?.(externalId)} />
        </div>
      )}
    </section>
  );
}

function RequestDetails({
  request,
  isCompact,
  showDownloads,
  onCopyLink,
}: {
  request: ServiceRequest;
  isCompact?: boolean;
  showDownloads?: boolean;
  onCopyLink?: (externalId: string) => void;
}) {
  const publicUpdates = (request.updates ?? []).filter((update: RequestUpdate) => update.public);
  const attachments = request.attachments ?? [];
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const shareOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = shareOrigin ? `${shareOrigin}/?request=${request.external_id}` : request.external_id;

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      onCopyLink?.(request.external_id);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  };

  return (
    <div className={`mt-3 space-y-3 text-sm text-slate-600 ${isCompact ? "" : "rounded-xl bg-slate-50 p-4"}`}>
      <div>
        <p className="font-semibold text-slate-800">{request.service_code}</p>
        <p className="text-xs text-slate-500">
          Filed {new Date(request.created_at).toLocaleString()} · Status: {request.status}
        </p>
        {request.jurisdiction_warning && (
          <p className="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-800">{request.jurisdiction_warning}</p>
        )}
      </div>
      {publicUpdates.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-slate-500">Updates</h4>
          <ul className="mt-2 space-y-2">
            {publicUpdates.map((update) => (
              <li key={update.id} className="rounded-lg bg-white p-2 text-slate-600">
                <p>{update.notes}</p>
                <p className="text-xs text-slate-500">
                  Posted {new Date(update.created_at).toLocaleString()}
                  {update.status_override ? ` · Status ${update.status_override}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {attachments.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-slate-500">Photos & Files</h4>
          <ul className="mt-2 space-y-2">
            {attachments.map((attachment: RequestAttachment) => (
              <li key={attachment.id} className="flex items-center justify-between rounded-lg bg-white p-2">
                <span>{attachment.file_path.split("/").pop()}</span>
                {showDownloads && (
                  <a
                    className="text-xs font-semibold text-slate-900 underline"
                    href={`/api/resident/requests/${request.external_id}/attachments/${attachment.id}`}
                  >
                    Download
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showDownloads && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
            onClick={handleCopyShareLink}
          >
            {copied ? "Link copied" : "Copy shareable link"}
          </button>
          <a
            className="text-xs font-semibold text-slate-900 underline"
            href={`/api/resident/requests/${request.external_id}/pdf`}
          >
            Download case PDF
          </a>
        </div>
      )}
    </div>
  );
}
