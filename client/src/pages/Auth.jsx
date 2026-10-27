import React, { useState, useEffect, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Session } from "../session";
import { Field, Notice } from "../components";

export function AuthPage({ register = false }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const session = useContext(Session),
    navigate = useNavigate();
  useEffect(() => setError(""), [register]);
  async function submit(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (register && values.password !== values.confirm)
      return setError("Passwords do not match");
    delete values.confirm;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/auth/${register ? "register" : "login"}`, {
        method: "POST",
        body: values,
      });
      session.login(data);
      navigate("/dashboard");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-layout">
      <div className="auth-copy">
        <p className="eyebrow">WELCOME TO YOUR HOME GROUND</p>
        <h1>
          {register ? "A new season." : "Welcome"}
          <br />
          <em>{register ? "Your season." : "back, gaffer."}</em>
        </h1>
        <p>Your football knowledge deserves a scoreboard.</p>
        <div className="giant-ball">✳</div>
      </div>
      <form className="panel auth-form" onSubmit={submit}>
        <p className="eyebrow">SFL FANTASY</p>
        <h2>{register ? "Create your account" : "Sign in to your squad"}</h2>
        {error && <Notice error>{error}</Notice>}
        {register && (
          <Field
            label="Your name"
            name="name"
            required
            minLength={2}
            autoComplete="name"
          />
        )}
        <Field
          label="Email address"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          minLength={7}
          maxLength={72}
          autoComplete={register ? "new-password" : "current-password"}
        />
        {register && (
          <>
            <small>
              Use at least 7 characters; any characters are allowed.
            </small>
            <Field
              label="Confirm password"
              name="confirm"
              type="password"
              required
              minLength={7}
              autoComplete="new-password"
            />
          </>
        )}
        <button disabled={busy}>
          {busy ? "Please wait…" : register ? "Create account ↗" : "Sign in ↗"}
        </button>
        <p>
          {register ? "Already on the team?" : "New to the game?"}{" "}
          <Link to={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </form>
    </section>
  );
}
