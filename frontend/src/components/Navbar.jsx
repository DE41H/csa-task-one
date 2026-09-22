import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Navbar() {
  const { isLoggedIn, username, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="navbar">
      <Link to="/missions" className="brand">
        <span className="brand-mark">GK</span>
        Golden Keyboard
      </Link>
      <div className="nav-links">
        <NavLink to="/missions" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Missions
        </NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Leaderboard
        </NavLink>
        <div className="nav-divider" />
        {isLoggedIn ? (
          <div className="user-chip">
            <span className="avatar">{username?.slice(0, 2)}</span>
            <span className="username">{username}</span>
            <button className="btn-ghost btn-sm" onClick={handleLogout}>
              Log out
            </button>
          </div>
        ) : (
          <>
            <NavLink to="/login" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Log in
            </NavLink>
            <Link to="/register">
              <button className="btn-sm">Register</button>
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
