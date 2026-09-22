import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth, api } from "../api";

export default function Register() {
  const navigate = useNavigate();
  const [hostels, setHostels] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", handle: "", hostel: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listHostels().then((data) => setHostels(data.results ?? data)).catch(() => {});
  }, []);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.register({ ...form, hostel: Number(form.hostel) });
      await auth.login(form.username, form.password);
      navigate("/missions");
    } catch (err) {
      const data = err.data || {};
      const msg = Object.entries(data).map(([field, msgs]) => `${field}: ${[].concat(msgs).join(", ")}`).join(" | ");
      setError(msg || "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card auth-card">
      <h2>Register</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input value={form.username} onChange={update("username")} required />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={update("password")} required />
        </label>
        <label>
          Handle
          <input value={form.handle} onChange={update("handle")} required />
        </label>
        <label>
          Hostel
          <select value={form.hostel} onChange={update("hostel")} required>
            <option value="" disabled>Select a hostel</option>
            {hostels.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Creating..." : "Create account"}</button>
      </form>
      <p>
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
