import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, NavLink } from "react-router-dom";
import { api } from "./api";
import { Session } from "./session";
import { Empty, Protected } from "./components";
import { Landing } from "./pages/Landing";
import { AuthPage } from "./pages/Auth";
import {
  TournamentList,
  TournamentPage,
  TeamPage,
  PlayerPage,
} from "./pages/Tournaments";
import { SquadBuilder } from "./pages/Squad";
import { Dashboard } from "./pages/Dashboard";
import { AdminHome, TournamentEditor, AdminTournament } from "./pages/Admin";
import { MatchPage } from "./pages/Match";

export function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (localStorage.getItem("sfl-token"))
      api("/auth/me")
        .then(setUser)
        .catch(() => localStorage.removeItem("sfl-token"))
        .finally(() => setLoading(false));
    else setLoading(false);
    const expire = () => setUser(null);
    window.addEventListener("sfl-session-expired", expire);
    return () => window.removeEventListener("sfl-session-expired", expire);
  }, []);
  function login(data) {
    localStorage.setItem("sfl-token", data.token);
    setUser(data.user);
  }
  function logout() {
    localStorage.removeItem("sfl-token");
    setUser(null);
  }
  return (
    <Session.Provider value={{ user, loading, login, logout }}>
      <BrowserRouter>
        <header>
          <Link className="brand" to="/">
            sfl<span>✳</span>
            <small>FANTASY</small>
          </Link>
          <nav aria-label="Main navigation">
            <NavLink to="/tournaments">Tournaments</NavLink>
            <NavLink to="/dashboard">My dashboard</NavLink>
            {user?.role === "admin" && (
              <NavLink to="/admin">Admin studio</NavLink>
            )}
          </nav>
          <div className="account">
            {user ? (
              <>
                <span>{user.name}</span>
                <button className="quiet" onClick={logout}>
                  Log out ↗
                </button>
              </>
            ) : (
              <Link className="button small" to="/login">
                Sign in ↗
              </Link>
            )}
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage register />} />
            <Route path="/tournaments" element={<TournamentList />} />
            <Route path="/tournaments/:id" element={<TournamentPage />} />
            <Route
              path="/tournaments/:id/squad"
              element={
                <Protected>
                  <SquadBuilder />
                </Protected>
              }
            />
            <Route path="/players/:id" element={<PlayerPage />} />
            <Route path="/teams/:id" element={<TeamPage />} />
            <Route path="/matches/:id" element={<MatchPage />} />
            <Route
              path="/dashboard"
              element={
                <Protected>
                  <Dashboard />
                </Protected>
              }
            />
            <Route
              path="/admin"
              element={
                <Protected admin>
                  <AdminHome />
                </Protected>
              }
            />
            <Route
              path="/admin/new"
              element={
                <Protected admin>
                  <TournamentEditor />
                </Protected>
              }
            />
            <Route
              path="/admin/:id/edit"
              element={
                <Protected admin>
                  <TournamentEditor />
                </Protected>
              }
            />
            <Route
              path="/admin/:id"
              element={
                <Protected admin>
                  <AdminTournament />
                </Protected>
              }
            />
            <Route
              path="*"
              element={
                <Empty>
                  Page not found. <Link to="/">Return home</Link>
                </Empty>
              }
            />
          </Routes>
        </main>
        <footer>
          <Link className="brand" to="/">
            sfl<span>✳</span>
          </Link>
          <p>Built for campus rivalries. Played your way.</p>
          <span>THE BEAUTIFUL GAME, REIMAGINED.</span>
        </footer>
      </BrowserRouter>
    </Session.Provider>
  );
}
