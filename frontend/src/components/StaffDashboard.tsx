import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import client from "../api/client";
import { useStaffRequests, useUpdateStaffRequest } from "../api/hooks";
import type { RequestAttachment, RequestUpdate, ServiceRequest } from "../types";

const statusOptions = ["received", "triaging", "assigned", "in_progress", "resolved", "closed"];

export function StaffDashboard() {
  const { data, isLoading } = useStaffRequests();
  const updateRequest = useUpdateStaffRequest();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const commentMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: { notes: string; public: boolean; status_override?: string | null };
    }) => client.post(`/api/staff/requests/${id}/comments`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff-requests"] }),
  });

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-white" />;
  }

  return (
    <div className="space-y-4">
      {data?.map((request) => {
        const aiAnalysis = (request.ai_analysis ?? null) as {
          severity?: number;
          recommended_category?: string;
        } | null;
        const active = selected === request.id;
        return (
          <motion.div
            key={request.id}
            layout
            className="rounded-2xl bg-white p-6 shadow"
            onClick={() => setSelected((prev) => (prev === request.id ? null : request.id))}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">{request.external_id}</p>
                <h3 className="text-xl font-semibold">{request.service_code}</h3>
              </div>
              <div className="flex items-center gap-3">
                <select
                  className="rounded-xl border border-slate-200 px-3 py-1"
                  value={request.status}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    updateRequest.mutate({ id: request.id, payload: { status: event.target.value } })
                  }
                >
                  {statusOptions.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-2 text-slate-600">{request.description}</p>
            {aiAnalysis?.severity && (
              <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm">
                AI Severity: {aiAnalysis.severity} · Suggested: {aiAnalysis.recommended_category ?? "n/a"}
              </div>
            )}
            {active && (
              <StaffRequestDetails
                request={request}
                onAddComment={(payload) =>
                  commentMutation.mutate({ id: request.id, payload: { ...payload, status_override: payload.status_override || undefined } })
                }
                isSubmitting={commentMutation.isPending}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function StaffRequestDetails({
  request,
  onAddComment,
  isSubmitting,
}: {
  request: ServiceRequest;
  onAddComment: (payload: { notes: string; public: boolean; status_override?: string | null }) => void;
  isSubmitting: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [statusOverride, setStatusOverride] = useState<string>("");

  const publicUpdates = (request.updates ?? []).filter((update: RequestUpdate) => update.public);
  const staffUpdates = (request.updates ?? []).filter((update: RequestUpdate) => !update.public);
  const attachments = request.attachments ?? [];
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    if (!shareCopied) return;
    const timeout = window.setTimeout(() => setShareCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [shareCopied]);

  const shareOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = shareOrigin ? `${shareOrigin}/?request=${request.external_id}` : request.external_id;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch (error) {
      console.error("Failed to copy share link", error);
    }
  };

  return (
    <div className="mt-4 space-y-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600" onClick={(event) => event.stopPropagation()}>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase text-slate-500">Attachments</h4>
          <button
            type="button"
            className="mt-1 text-[11px] font-semibold uppercase text-slate-600 underline"
            onClick={copyShareLink}
          >
            {shareCopied ? "Resident link copied" : "Copy resident link"}
          </button>
          {attachments.length === 0 ? (
            <p className="text-xs text-slate-500">No files uploaded.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {attachments.map((attachment: RequestAttachment) => (
                <li key={attachment.id} className="flex items-center justify-between rounded-lg bg-white p-2">
                  <span>{attachment.file_path.split("/").pop()}</span>
                  <a
                    className="text-xs font-semibold text-slate-900 underline"
                    href={`/api/staff/requests/${request.id}/attachments/${attachment.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase text-slate-500">Case PDF</h4>
          <a
            className="mt-2 inline-block text-xs font-semibold text-slate-900 underline"
            href={`/api/staff/requests/${request.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Download latest report
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CommentList title="Public timeline" updates={publicUpdates} />
        <CommentList title="Staff notes" updates={staffUpdates} />
      </div>

      <div className="space-y-2 rounded-lg bg-white p-3">
        <h4 className="text-xs font-semibold uppercase text-slate-500">Add update</h4>
        <textarea
          className="w-full rounded-xl border border-slate-200 p-2"
          placeholder="Share an update..."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
            Visible to resident
          </label>
          <select
            className="rounded-xl border border-slate-200 px-3 py-1 text-sm"
            value={statusOverride}
            onChange={(event) => setStatusOverride(event.target.value)}
          >
            <option value="">No status change</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                Set status: {status}
              </option>
            ))}
          </select>
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            disabled={isSubmitting || !notes.trim()}
            onClick={() =>
              onAddComment({
                notes: notes.trim(),
                public: isPublic,
                status_override: statusOverride || undefined,
              })
            }
          >
            {isSubmitting ? "Saving..." : "Post update"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentList({ title, updates }: { title: string; updates: RequestUpdate[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase text-slate-500">{title}</h4>
      {updates.length === 0 ? (
        <p className="text-xs text-slate-500">No entries.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {updates.map((update) => (
            <li key={update.id} className="rounded-lg bg-white p-2 text-slate-600">
              <p>{update.notes}</p>
              <p className="text-xs text-slate-500">
                Posted {new Date(update.created_at).toLocaleString()}
                {update.status_override ? ` · Status ${update.status_override}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
