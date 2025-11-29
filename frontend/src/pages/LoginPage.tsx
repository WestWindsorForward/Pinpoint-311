import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchCurrentUser, login } from "../api/auth";
import { useAuthStore } from "../store/auth";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const setSession = useAuthStore((state) => state.setSession);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | undefined)?.from;

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: async (tokens) => {
      setSession({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });
      try {
        const profile = await fetchCurrentUser();
        setUser(profile);
        if (profile.must_reset_password) {
          navigate("/change-password", { replace: true, state: { from } });
          return;
        }
        navigate(from?.pathname ?? "/", { replace: true });
      } catch (error) {
        console.error(error);
        clearSession();
      }
    },
  });

  return (
    <div className="mx-auto max-w-md rounded-3xl bg-white p-8 shadow">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Secure access for staff and administrators.</p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({ email, password });
        }}
      >
        <div>
          <label className="text-sm font-medium text-slate-600">Email</label>
          <input
            type="email"
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Password</label>
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {mutation.isError && (
          <p className="text-sm text-red-500">Invalid credentials. Please try again.</p>
        )}
        <button
          type="submit"
          className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Signing in..." : "Sign in"}
        </button>
        <div className="text-right">
          <a href="/reset" className="text-xs font-semibold text-slate-600 underline">Forgot password?</a>
        </div>
      </form>
    </div>
  );
}
