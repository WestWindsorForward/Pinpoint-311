import { motion } from "framer-motion";

import { useStaffRequests, useUpdateStaffRequest } from "../api/hooks";

const statusOptions = ["received", "triaging", "assigned", "in_progress", "resolved", "closed"];

export function StaffDashboard() {
  const { data, isLoading } = useStaffRequests();
  const updateRequest = useUpdateStaffRequest();

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
        return (
          <motion.div key={request.id} layout className="rounded-2xl bg-white p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">{request.external_id}</p>
                <h3 className="text-xl font-semibold">{request.service_code}</h3>
              </div>
              <select
                className="rounded-xl border border-slate-200 px-3 py-1"
                value={request.status}
                onChange={(event) =>
                  updateRequest.mutate({ id: request.id, payload: { status: event.target.value } })
                }
              >
                {statusOptions.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-slate-600">{request.description}</p>
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
