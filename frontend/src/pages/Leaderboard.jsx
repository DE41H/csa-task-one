import { useState, useEffect } from "react";
import { api } from "../api";

export default function Leaderboard() {
  const [hostels, setHostels] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listLeaderboard()
      .then((data) => setHostels(data.results ?? data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h2>Leaderboard</h2>
      {error && <p className="error">{error}</p>}
      <table className="leaderboard">
        <thead>
          <tr>
            <th>#</th>
            <th>Hostel</th>
            <th>Score</th>
            <th>Cracked missions</th>
          </tr>
        </thead>
        <tbody>
          {hostels.map((h, i) => (
            <tr key={h.id}>
              <td>{i + 1}</td>
              <td>{h.name}</td>
              <td>{h.score}</td>
              <td>{h.cracked_missions.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
