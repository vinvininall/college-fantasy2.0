import React, { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api, rupees } from "../api";

import { Field, Badge, Notice, Empty, Loading, Stat } from "../components";
import { PlayerBrowser } from "./Tournaments";

export function SquadBuilder() {
  const { id } = useParams();
  const [t, setT] = useState(null),
    [squad, setSquad] = useState(null),
    [players, setPlayers] = useState([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api(`/tournaments/${id}`), api(`/tournaments/${id}/my-squad`)])
      .then(async ([t, s]) => {
        const ids = s?.players || [];
        const ps = await Promise.all(ids.map((p) => api(`/players/${p}`)));
        setT(t);
        setPlayers(ps);
        setSquad(
          s || {
            players: [],
            starters: [],
            captain: null,
            viceCaptain: null,
            complete: false,
          },
        );
      })
      .catch((e) => setError(e.message));
  }, [id]);
  if (!squad || !t) return error ? <Notice error>{error}</Notice> : <Loading />;
  const spent = players.reduce((sum, p) => sum + p.fantasyPrice, 0);
  const remaining = t.budget - spent;
  function update(patch) {
    setSquad((s) => ({ ...s, ...patch, complete: false }));
    setMessage("");
    setError("");
  }
  function toggle(p) {
    if (squad.players.includes(p._id)) {
      setPlayers((ps) => ps.filter((x) => x._id !== p._id));
      update({
        players: squad.players.filter((x) => x !== p._id),
        starters: squad.starters.filter((x) => x !== p._id),
        captain: squad.captain === p._id ? null : squad.captain,
        viceCaptain: squad.viceCaptain === p._id ? null : squad.viceCaptain,
      });
    } else {
      if (players.length >= t.squadSize)
        return setError("Your squad is full. Remove a player first.");
      if (p.fantasyPrice > remaining)
        return setError("Not enough budget for this player.");
      setPlayers((ps) => [...ps, p]);
      update({ players: [...squad.players, p._id] });
    }
  }
  async function save(complete) {
    setBusy(true);
    setError("");
    try {
      const saved = await api(`/tournaments/${id}/my-squad`, {
        method: "PUT",
        body: {
          players: squad.players,
          starters: squad.starters,
          captain: squad.captain,
          viceCaptain: squad.viceCaptain,
          complete,
          ...(squad.__v !== undefined ? { version: squad.__v } : {}),
        },
      });
      setSquad(saved);
      setMessage(
        complete
          ? "Your squad is complete. You’re on the team sheet."
          : "Progress saved. Come back to finish your lineup.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  players
    .filter((p) => squad.starters.includes(p._id))
    .forEach((p) => counts[p.position]++);
  return (
    <section className="section">
      <Link to={`/tournaments/${id}`} className="text-link">
        ← {t.name}
      </Link>
      <div className="section-heading">
        <div>
          <p className="eyebrow">THE MANAGER’S OFFICE</p>
          <h1>
            Make it <em>your squad.</em>
          </h1>
        </div>
        <Badge>{squad.complete ? "Complete" : "In progress"}</Badge>
      </div>
      {t.status !== "upcoming" && (
        <Notice>
          Squad registration is closed. Your saved lineup is shown below.
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <div className="stats">
        <Stat
          label="Players selected"
          value={`${players.length} / ${t.squadSize}`}
        />
        <Stat label="Budget remaining" value={rupees(remaining)} />
        <Stat label="Amount spent" value={rupees(spent)} />
        <Stat
          label="Starting / bench"
          value={`${squad.starters.length} / ${players.length - squad.starters.length}`}
        />
      </div>
      <div className="builder">
        <div>
          <h2>The player pool</h2>
          <PlayerBrowser
            tournament={id}
            selected={squad.players}
            onToggle={toggle}
          />
        </div>
        <aside className="squad-panel">
          <div className="panel">
            <h2>
              Your team sheet <span>↗</span>
            </h2>
            <p>
              Select {t.startingPlayers} starters and {t.substitutes}{" "}
              substitutes.
            </p>
            <div className="mini-pitch">
              {["FWD", "MID", "DEF", "GK"].map((pos) => (
                <div className="pitch-row" key={pos}>
                  {players
                    .filter(
                      (p) =>
                        p.position === pos && squad.starters.includes(p._id),
                    )
                    .map((p) => (
                      <div className="pitch-player" key={p._id}>
                        <span>
                          {p.jerseyNumber || "✳"}
                          {squad.captain === p._id
                            ? " C"
                            : squad.viceCaptain === p._id
                              ? " V"
                              : ""}
                        </span>
                        <small>{p.name.split(" ")[0]}</small>
                      </div>
                    ))}
                </div>
              ))}
            </div>
            <p className="formation-summary">
              Formation: {counts.GK} GK · {counts.DEF} DEF · {counts.MID} MID ·{" "}
              {counts.FWD} FWD
            </p>
            <details>
              <summary>Permitted formations</summary>
              {t.formationPolicy === "unrestricted" ? (
                <p>No positional restrictions.</p>
              ) : (
                t.formations.map((f) => (
                  <p key={f.name}>
                    {f.name}: {f.GK} GK / {f.DEF} DEF / {f.MID} MID / {f.FWD}{" "}
                    FWD
                  </p>
                ))
              )}
            </details>
            {players.length ? (
              players.map((p) => (
                <div className="selected-player" key={p._id}>
                  <div>
                    <Badge>{p.position}</Badge>
                    <b>{p.name}</b>
                    <small>{rupees(p.fantasyPrice)}</small>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={squad.starters.includes(p._id)}
                      onChange={(e) => {
                        if (
                          e.target.checked &&
                          squad.starters.length >= t.startingPlayers
                        )
                          return setError("Maximum starters selected");
                        update({
                          starters: e.target.checked
                            ? [...squad.starters, p._id]
                            : squad.starters.filter((s) => s !== p._id),
                        });
                      }}
                    />{" "}
                    Starter
                  </label>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => toggle(p)}
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <Empty>Your next game changer is in the player pool.</Empty>
            )}
            <Field label="Captain">
              <select
                value={squad.captain || ""}
                onChange={(e) => update({ captain: e.target.value || null })}
              >
                <option value="">Choose captain</option>
                {players.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vice-captain">
              <select
                value={squad.viceCaptain || ""}
                onChange={(e) =>
                  update({ viceCaptain: e.target.value || null })
                }
              >
                <option value="">Choose vice-captain</option>
                {players.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="muted">
              Only starters earn points. Captains on the bench score zero.
            </p>
            <div className="stack">
              <button
                className="secondary"
                disabled={busy || t.status !== "upcoming"}
                onClick={() => save(false)}
              >
                Save progress
              </button>
              <button
                disabled={busy || t.status !== "upcoming"}
                onClick={() => save(true)}
              >
                {busy ? "Saving…" : "Complete my squad ↗"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
