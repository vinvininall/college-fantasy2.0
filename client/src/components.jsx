import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from "react";
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
  const requestKey = `${path}:${all}`;
  const previousRequestKey = useRef(requestKey);
  const latestRequest = useRef(0);
  const fetchData = useCallback(async () => {
    if (!all) return api(path);
    const rows = [];
    let page = 1;
    while (true) {
      const batch = await api(
        `${path}${path.includes("?") ? "&" : "?"}page=${page}&limit=100`,
      );
      rows.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    return rows;
  }, [path, all]);
  useEffect(() => {
    let alive = true;
    if (previousRequestKey.current !== requestKey) {
      previousRequestKey.current = requestKey;
      setData(null);
    }
    setError("");
    const request = ++latestRequest.current;
    fetchData()
      .then((result) => {
        if (alive && request === latestRequest.current) setData(result);
      })
      .catch((e) => {
        if (alive && request === latestRequest.current) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [fetchData, requestKey, revision]);
  useEffect(() => {
    if (!pollMs) return;
    let alive = true;
    let timer;
    async function poll() {
      const request = ++latestRequest.current;
      try {
        const result = await fetchData();
        if (alive && request === latestRequest.current) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (alive && request === latestRequest.current) setError(e.message);
      } finally {
        if (alive) timer = setTimeout(poll, pollMs);
      }
    }
    timer = setTimeout(poll, pollMs);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [fetchData, pollMs]);
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
