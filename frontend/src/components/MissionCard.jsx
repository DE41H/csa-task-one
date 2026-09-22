import { useState } from "react";

const STATUS_LABEL = {
  unclaimed: "Unclaimed",
  in_progress: "In progress",
  cracked: "Cracked",
  expired: "Expired",
};

export default function MissionCard({ mission, isLoggedIn, onClaim, onDrop, onComplete }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function run(action) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(err.data?.detail || err.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`mission-card status-${mission.status}`}>
      <div className="mission-header">
        <h3>{mission.codename}</h3>
        <span className={`badge badge-${mission.status}`}>{STATUS_LABEL[mission.status] || mission.status}</span>
      </div>
      <p className="mission-brief">{mission.brief}</p>
      <div className="mission-meta">
        <span>{mission.points} pts</span>
        <span>{mission.difficulty}</span>
        <span>Deadline: {new Date(mission.deadline).toLocaleString()}</span>
      </div>
      <div className="mission-meta">
        <span>Claimed by: {mission.claimed_by?.handle ?? "—"} {mission.claimed_by ? `(${mission.claimed_by.hostel})` : ""}</span>
      </div>
      <div className="mission-meta">
        <span>Cracked by: {mission.completed_by?.handle ?? "—"} {mission.completed_by ? `(${mission.completed_by.hostel})` : ""}</span>
      </div>

      {isLoggedIn && (
        <div className="mission-actions">
          <button disabled={busy} onClick={() => run(() => onClaim(mission.id))}>Claim</button>
          <button disabled={busy} onClick={() => run(() => onDrop(mission.id))}>Drop</button>
          <button disabled={busy} onClick={() => run(() => onComplete(mission.id))}>Complete</button>
        </div>
      )}
      {message && <p className="error small">{message}</p>}
    </div>
  );
}
