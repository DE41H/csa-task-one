import { useState, useEffect } from "react";
import { api } from "../api";

const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function Leaderboard() {
  const [hostels, setHostels] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listLeaderboard()
      .then((data) => setHostels(data.results ?? data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const topScore = Math.max(1, ...hostels.map((h) => h.score));

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Leaderboard</h2>
          <p>Hostels ranked by missions cracked — updated live, never hand-edited.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && (
        <div className="loading-state">
          <span className="spinner" /> Loading leaderboard...
        </div>
      )}

      {!loading && (
        <div className="card leaderboard-card">
          {hostels.map((h, i) => {
            const rank = i + 1;
            return (
              <div className="leaderboard-row" key={h.id}>
                <span className={`rank-badge${rank <= 3 ? ` rank-${rank}` : ""}`}>{MEDALS[rank] ?? rank}</span>
                <div className="leaderboard-hostel">
                  <div className="name">{h.name}</div>
                  <div className="sub">
                    {h.cracked_missions.length} mission{h.cracked_missions.length === 1 ? "" : "s"} cracked
                  </div>
                </div>
                <div className="leaderboard-score">
                  <div className="score-bar-track">
                    <div className="score-bar-fill" style={{ width: `${Math.max(4, (h.score / topScore) * 100)}%` }} />
                  </div>
                  <span className="score-value">{h.score}</span>
                  <span className="score-unit">pts</span>
                </div>
              </div>
            );
          })}
          {hostels.length === 0 && <p className="empty-state">No hostels yet.</p>}
        </div>
      )}
    </div>
  );
}
