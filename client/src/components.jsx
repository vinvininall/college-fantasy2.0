import React, { useState, useEffect, useContext } from "react";
import { Navigate } from "react-router-dom";
import { api } from "./api";
import { Session } from "./session";

export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}

export function Badge({ children }) {
  return (
    <span className={`badge ${String(children).toLowerCase()}`}>
      {children}
    </span>
  );
}

export function Notice({ error, children }) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`notice ${error ? "error" : ""}`}
    >
      {children}
    </div>
  );
}

export function Empty({ children }) {
  return (
    <div className="empty">
      <span>◈</span>
      <p>{children}</p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading" role="status">
      Loading the field…
    </div>
  );
}

export function useLoad(path, { all = false, pollMs = 0 } = {}) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer;
    setData(null);
    setError("");
    async function fetchData() {
      if (!all) return api(path);
      const rows = [];
      let page = 1;
      while (alive) {
        const batch = await api(
          `${path}${path.includes("?") ? "&" : "?"}page=${page}&limit=100`,
        );
        rows.push(...batch);
        if (batch.length < 100) break;
        page++;
      }
      return rows;
    }
    async function load() {
      try {
        const result = await fetchData();
        if (alive) setData(result);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive && pollMs > 0) timer = setTimeout(load, pollMs);
      }
    }
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [path, revision, all, pollMs]);
  return { data, error, reload: () => setRevision((n) => n + 1) };
}

export function Async({ load, children }) {
  if (load.error)
    return (
      <Notice error>
        {load.error} <button onClick={load.reload}>Retry</button>
      </Notice>
    );
  if (load.data === null) return <Loading />;
  return children(load.data);
}

export function Protected({ admin = false, children }) {
  const s = useContext(Session);
  if (s.loading) return <Loading />;
  if (!s.user) return <Navigate to="/login" replace />;
  if (admin && s.user.role !== "admin")
    return <Navigate to="/dashboard" replace />;
  return children;
}

export function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
