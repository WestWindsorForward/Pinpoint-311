import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { changePassword } from "../api/auth";
import { useAuthStore } from "../store/auth";

export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | undefined)?.from;

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      if (user) {
        setUser({ ...user, must_reset_password: false });
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      navigate(from?.pathname ?? "/", { replace: true });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      return;
    }
    mutation.mutate({ current_password: currentPassword, new_password: newPassword });
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl bg-white p-8 shadow">
      <h1 className="text-2xl font-semibold">Update your password</h1>
      <p className="mt-1 text-sm text-slate-500">
        For security, please set a new password before accessing staff tools.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="text-sm text-slate-600">
          Current password
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label className="text-sm text-slate-600">
          New password
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </label>
        <label className="text-sm text-slate-600">
          Confirm new password
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        {newPassword !== confirmPassword && (
          <p className="text-xs text-rose-500">New passwords do not match.</p>
        )}
        {mutation.isError && (
          <p className="text-xs text-rose-500">Password update failed. Double-check your current password.</p>
        )}
        <button
          type="submit"
          className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-50"
          disabled={mutation.isPending || newPassword !== confirmPassword}
        >
          {mutation.isPending ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
