import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useState } from "react";

import { useStaffRequests, useUpdateStaffRequest } from "../api/hooks";
import { useNavigate } from "react-router-dom";

const statusOptions = ["received", "triaging", "assigned", "in_progress", "resolved", "closed"];

export function StaffDashboard() {
  const { data, isLoading } = useStaffRequests();
  const updateRequest = useUpdateStaffRequest();
  useQueryClient();
  const navigate = useNavigate();
  const [sortMode, setSortMode] = useState<"priority" | "department">("priority");
  // comment posting moved into details page

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-white" />;
  }

  const priorityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const departments = Array.from(new Set((data ?? []).map(r => r.assigned_department).filter(Boolean))) as string[];
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set());
  const isDeptVisible = (slug: string | null | undefined) => {
    if (!deptFilter || deptFilter.size === 0) return true;
    return slug ? deptFilter.has(slug) : deptFilter.has("");
  };
  const sorted = (data ?? []).filter(r => isDeptVisible(r.assigned_department)).slice().sort((a, b) => {
    if (sortMode === "priority") {
      return (priorityOrder[b.priority?.toLowerCase?.() || "medium"] ?? 2) - (priorityOrder[a.priority?.toLowerCase?.() || "medium"] ?? 2);
    }
    return (a.assigned_department || "").localeCompare(b.assigned_department || "");
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "received": return "bg-slate-200 text-slate-700";
      case "triaging": return "bg-amber-100 text-amber-700";
      case "assigned": return "bg-indigo-100 text-indigo-700";
      case "in_progress": return "bg-blue-100 text-blue-700";
      case "waiting_external": return "bg-purple-100 text-purple-700";
      case "resolved": return "bg-green-100 text-green-700";
      case "closed": return "bg-slate-300 text-slate-700";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  const since = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Unified Command Center</h2>
          <p className="text-xs text-slate-500">Sort by triaged priority or department. Click a card to open full details.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-600">Sort</label>
          <select className="rounded-lg border border-slate-300 p-2 text-sm" value={sortMode} onChange={(e) => setSortMode(e.target.value as any)}>
            <option value="priority">Priority (triaged)</option>
            <option value="department">Department</option>
          </select>
          {departments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {departments.map(d => (
                <button key={d} type="button" className={`rounded-full px-2 py-1 text-xs ${deptFilter.has(d) ? "bg-slate-900 text-white" : "border border-slate-300"}`} onClick={() => {
                  setDeptFilter(prev => {
                    const next = new Set(prev);
                    if (next.has(d)) next.delete(d); else next.add(d);
                    return next;
                  });
                }}>{d}</button>
              ))}
              <button type="button" className="rounded-full border border-slate-300 px-2 py-1 text-xs" onClick={() => setDeptFilter(new Set())}>All</button>
            </div>
          )}
        </div>
      </div>
      {sorted.map((request) => {
        const aiAnalysis = (request.ai_analysis ?? null) as {
          severity?: number;
          recommended_category?: string;
        } | null;
        return (
          <motion.div
            key={request.id}
            layout
            className="rounded-2xl bg-white p-6 shadow"
            onClick={() => navigate(`/requests/${request.external_id}`)}
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
                  onChange={(event) => {
                    event.stopPropagation();
                    updateRequest.mutate({ id: request.id, payload: { status: event.target.value } });
                  }}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{String(status).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
                <span className={`rounded-full px-2 py-1 text-xs ${statusColor(request.status)}`}>{request.status}</span>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-slate-600">{request.description}</p>
              <span className="text-xs text-slate-500">{since(request.created_at)}</span>
            </div>
            {aiAnalysis?.severity && (
              <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm">
                AI Severity: {aiAnalysis.severity} · Suggested: {aiAnalysis.recommended_category ?? "n/a"}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// details and comment controls are available in the RequestDetailsPage
