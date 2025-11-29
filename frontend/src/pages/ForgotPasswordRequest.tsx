import { useMutation } from "@tanstack/react-query";
import client from "../api/client";
import { useState } from "react";

export function ForgotPasswordRequestPage() {
  const [email, setEmail] = useState("");
  const mutation = useMutation({
    mutationFn: async () => client.post("/api/auth/forgot-password", { email }),
  });
  return (
    <div className="mx-auto max-w-md rounded-3xl bg-white p-8 shadow">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-500">Enter your work email to receive a reset link.</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <label className="text-sm font-medium text-slate-600">
          Email
          <input type="email" className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white" disabled={mutation.isPending}>
          {mutation.isPending ? "Submitting…" : "Send reset link"}
        </button>
        {mutation.isSuccess && <p className="text-xs text-slate-500">If an account exists, a reset link has been sent.</p>}
      </form>
    </div>
  );
}

