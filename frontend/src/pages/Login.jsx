import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      navigate("/missions");
    } catch (err) {
      setError(err.data?.detail || "Invalid credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <div className="auth-mark">GK</div>
        <h2>Welcome back</h2>
        <p className="auth-subtitle">Log in to claim missions for your hostel.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Logging in..." : "Log in"}
          </button>
        </form>
        <p>
          No account yet? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
