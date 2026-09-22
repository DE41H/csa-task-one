import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import MissionCard from "../components/MissionCard";

const DIFFICULTIES = ["easy", "medium", "hard", "extreme", "brutal"];
const STATUSES = ["unclaimed", "in_progress", "cracked", "expired"];

function buildQuery({ status, difficulty, search, page }) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (difficulty) params.set("difficulty", difficulty);
  if (search) params.set("search", search);
  if (page && page > 1) params.set("page", page);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default function Missions() {
  const { isLoggedIn } = useAuth();
  const [status, setStatus] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ results: [], count: 0, next: null, previous: null });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listMissions(buildQuery({ status, difficulty, search, page }))
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, difficulty, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  function resetToFirstPage(setter) {
    return (value) => {
      setPage(1);
      setter(value);
    };
  }

  return (
    <div>
      <h2>Missions</h2>

      <div className="filters">
        <select value={status} onChange={(e) => resetToFirstPage(setStatus)(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select value={difficulty} onChange={(e) => resetToFirstPage(setDifficulty)(e.target.value)}>
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <input
          placeholder="Search codename or brief..."
          value={search}
          onChange={(e) => resetToFirstPage(setSearch)(e.target.value)}
        />
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}

      <div className="mission-list">
        {data.results.map((m) => (
          <MissionCard
            key={m.id}
            mission={m}
            isLoggedIn={isLoggedIn}
            onClaim={(id) => api.claimMission(id).then(load)}
            onDrop={(id) => api.dropMission(id).then(load)}
            onComplete={(id) => api.completeMission(id).then(load)}
          />
        ))}
        {!loading && data.results.length === 0 && <p>No missions match these filters.</p>}
      </div>

      <div className="pagination">
        <button disabled={!data.previous} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
        <span>Page {page} · {data.count} total</span>
        <button disabled={!data.next} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}
