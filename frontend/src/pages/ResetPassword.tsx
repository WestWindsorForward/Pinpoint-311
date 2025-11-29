import { useMutation } from "@tanstack/react-query";
import client from "../api/client";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get("token") ?? "";
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mutation = useMutation({
    mutationFn: async () => client.post("/api/auth/reset-password", { token, new_password: password }),
  });
  const disabled = !token || !password || password !== confirm;
  return (
    <div className="mx-auto max-w-md rounded-3xl bg-white p-8 shadow">
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      <p className="mt-1 text-sm text-slate-500">Paste the reset token from your email if it isn’t filled automatically.</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) mutation.mutate();
        }}
      >
        <label className="text-sm font-medium text-slate-600">Reset token<input className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={token} onChange={(e) => setToken(e.target.value)} /></label>
        <label className="text-sm font-medium text-slate-600">New password<input type="password" className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="text-sm font-medium text-slate-600">Confirm password<input type="password" className="mt-1 w-full rounded-xl border border-slate-300 p-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <button type="submit" className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-50" disabled={disabled || mutation.isPending}>{mutation.isPending ? "Saving…" : "Reset password"}</button>
        {mutation.isSuccess && <p className="text-xs text-green-600">Password updated. You can now sign in.</p>}
        {mutation.isError && <p className="text-xs text-rose-600">Invalid or expired token.</p>}
      </form>
    </div>
  );
}

