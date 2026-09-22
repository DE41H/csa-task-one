import { createContext, useContext, useState, useCallback } from "react";
import { auth } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [username, setUsername] = useState(auth.currentUsername());

  const login = useCallback(async (u, p) => {
    await auth.login(u, p);
    setUsername(u);
  }, []);

  const logout = useCallback(() => {
    auth.logout();
    setUsername(null);
  }, []);

  const value = { username, isLoggedIn: Boolean(username), login, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
