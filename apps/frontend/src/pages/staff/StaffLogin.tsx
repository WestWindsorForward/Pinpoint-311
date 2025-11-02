import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "../../store/auth";

export default function StaffLogin() {
  const login = useAuthStore((state) => state.login);
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [token, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/staff/dashboard", { replace: true });
    } catch (err) {
      setError("Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#e5ecf6" }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: "400px", display: "grid", gap: "16px" }}>
        <h2>Staff Portal Login</h2>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error && <span style={{ color: "#b91c1c" }}>{error}</span>}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
        <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          Need access? Contact the Township system administrator to have an account provisioned.
        </p>
      </form>
    </div>
  );
}
