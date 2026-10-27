import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, rupees } from "../api";

import { Field, Badge, Notice, Empty, useLoad, Async } from "../components";
import { Fixtures, Leaderboard } from "./Tournaments";
const defaults = {
  goal: { GK: 10, DEF: 7, MID: 6, FWD: 5 },
  assist: 3,
  cleanSheet: 4,
  penaltySave: 5,
  goalkeeperSave: 1,
  shotOnTarget: 1,
  penaltyMissed: -2,
  playerOfTheMatch: 5,
  yellowCard: -1,
  redCard: -3,
  ownGoal: -2,
  captain: 2,
  viceCaptain: 1.5,
};

export function initialTournament() {
  return {
    name: "",
    college: "",
    description: "",
    format: "7v7",
    budget: 15000000,
    squadSize: 10,
    startingPlayers: 7,
    substitutes: 3,
    formationPolicy: "configured",
    formations: [{ name: "2–3–1", GK: 1, DEF: 2, MID: 3, FWD: 1 }],
    registrationEnabled: true,
    scoring: structuredClone(defaults),
  };
}

export function AdminHome() {
  const l = useLoad("/admin/tournaments", { all: true });
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ADMIN STUDIO</p>
          <h1>
            Behind every
            <br />
            <em>great game.</em>
          </h1>
        </div>
        <Link className="button" to="/admin/new">
          Create tournament +
        </Link>
      </div>
      <Async load={l}>
        {(ts) =>
          ts.length ? (
            <div className="grid three">
              {ts.map((t) => (
                <div className="panel" key={t._id}>
                  <Badge>{t.status}</Badge>
                  <p className="eyebrow">{t.college}</p>
                  <h3>{t.name}</h3>
                  <p>
                    {t.format} · {t.squadSize} player squad
                  </p>
                  <Link className="button small" to={`/admin/${t._id}`}>
                    Manage tournament ↗
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Create your first tournament to get the ball rolling.</Empty>
          )
        }
      </Async>
    </section>
  );
}

export function TournamentEditor() {
  const { id } = useParams();
  const [v, setV] = useState(initialTournament),
    [ready, setReady] = useState(!id),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    if (id)
      api(`/tournaments/${id}`)
        .then((t) => {
          const keys = Object.keys(initialTournament());
          setV(
            Object.fromEntries(
              keys.map((k) => [
                k,
                k === "scoring"
                  ? {
                      ...defaults,
                      ...t.scoring,
                      goal: { ...defaults.goal, ...t.scoring?.goal },
                    }
                  : t[k],
              ]),
            ),
          );
          setReady(true);
        })
        .catch((e) => setError(e.message));
  }, [id]);
  const set = (k, value) => setV((v) => ({ ...v, [k]: value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const t = await api(id ? `/tournaments/${id}` : "/tournaments", {
        method: id ? "PUT" : "POST",
        body: v,
      });
      nav(`/admin/${t._id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section narrow">
      <p className="eyebrow">ADMIN STUDIO / TOURNAMENT RULES</p>
      <h1>
        {id ? "Edit the" : "Set the"} <em>stage.</em>
      </h1>
      {error && <Notice error>{error}</Notice>}
      {ready && (
        <form onSubmit={submit} className="panel stack">
          <div className="grid two">
            <Field
              label="Tournament name"
              required
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
            />
            <Field
              label="College name"
              required
              value={v.college}
              onChange={(e) => set("college", e.target.value)}
            />
          </div>
          <Field label="Description">
            <textarea
              value={v.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <div className="grid three">
            <Field label="Football format">
              <select
                value={v.format}
                onChange={(e) => set("format", e.target.value)}
              >
                {["5v5", "6v6", "7v7", "9v9", "11v11"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Fantasy budget (₹)"
              type="number"
              min="1"
              required
              value={v.budget}
              onChange={(e) => set("budget", +e.target.value)}
            />
            <Field
              label="Starting lineup size"
              type="number"
              min="1"
              max="100"
              required
              value={v.startingPlayers}
              onChange={(e) => set("startingPlayers", +e.target.value)}
            />
            <Field
              label="Substitutes"
              type="number"
              min="0"
              max="100"
              required
              value={v.substitutes}
              onChange={(e) => set("substitutes", +e.target.value)}
            />
            <Field
              label="Fantasy squad size"
              type="number"
              min="1"
              max="100"
              required
              value={v.squadSize}
              onChange={(e) => set("squadSize", +e.target.value)}
            />
          </div>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              const n = parseInt(v.format),
                def = n >= 9 ? 4 : 2,
                mid = n - def - 2;
              setV((s) => ({
                ...s,
                startingPlayers: n,
                substitutes: 3,
                squadSize: n + 3,
                formations: [
                  {
                    name: `${def}–${mid}–1`,
                    GK: 1,
                    DEF: def,
                    MID: mid,
                    FWD: 1,
                  },
                ],
              }));
            }}
          >
            Apply suggested {v.format} squad defaults
          </button>
          <small>
            Changing the format preserves custom settings. Apply suggestions
            only when you want to replace lineup counts and formations.
          </small>
          <label>
            <input
              type="checkbox"
              checked={v.registrationEnabled}
              onChange={(e) => set("registrationEnabled", e.target.checked)}
            />{" "}
            Accept squad registration while upcoming
          </label>
          <Field label="Formation policy">
            <select
              value={v.formationPolicy}
              onChange={(e) => set("formationPolicy", e.target.value)}
            >
              <option value="configured">Require a permitted formation</option>
              <option value="unrestricted">
                Explicitly unrestricted positions
              </option>
            </select>
          </Field>
          {v.formationPolicy === "configured" && (
            <fieldset>
              <legend>Permitted formations</legend>
              {v.formations.map((f, i) => (
                <div className="formation-input" key={i}>
                  {["name", "GK", "DEF", "MID", "FWD"].map((k) => (
                    <Field
                      key={k}
                      label={k}
                      type={k === "name" ? "text" : "number"}
                      min="0"
                      max="100"
                      required
                      value={f[k]}
                      onChange={(e) =>
                        set(
                          "formations",
                          v.formations.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  [k]:
                                    k === "name"
                                      ? e.target.value
                                      : +e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  ))}
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Remove formation ${i + 1}`}
                    onClick={() =>
                      set(
                        "formations",
                        v.formations.filter((_, j) => j !== i),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  set("formations", [
                    ...v.formations,
                    { name: "New formation", GK: 1, DEF: 2, MID: 3, FWD: 1 },
                  ])
                }
              >
                Add formation +
              </button>
            </fieldset>
          )}
          <details>
            <summary>Configure scoring rules</summary>
            <div className="grid three">
              {Object.entries(v.scoring.goal).map(([k, n]) => (
                <Field
                  label={`${k} goal`}
                  key={k}
                  type="number"
                  step="0.5"
                  value={n}
                  onChange={(e) =>
                    set("scoring", {
                      ...v.scoring,
                      goal: { ...v.scoring.goal, [k]: +e.target.value },
                    })
                  }
                />
              ))}
              {Object.entries(v.scoring)
                .filter(([k]) => k !== "goal")
                .map(([k, n]) => (
                  <Field
                    label={k.replace(/([A-Z])/g, " $1")}
                    key={k}
                    type="number"
                    step="0.5"
                    value={n}
                    onChange={(e) =>
                      set("scoring", { ...v.scoring, [k]: +e.target.value })
                    }
                  />
                ))}
            </div>
          </details>
          <div className="summary">
            <h3>Configuration summary</h3>
            <p>
              {v.format} football · {v.squadSize} selected · {v.startingPlayers}{" "}
              starters + {v.substitutes} bench · {rupees(v.budget)}
            </p>
            {v.squadSize !== v.startingPlayers + v.substitutes && (
              <Notice error>
                Squad size must equal starters plus substitutes.
              </Notice>
            )}
            <p>
              Rules freeze after the first squad or fixture. Rosters freeze
              after the first squad.
            </p>
          </div>
          <button disabled={busy}>
            {busy
              ? "Saving…"
              : id
                ? "Save tournament ↗"
                : "Create draft tournament ↗"}
          </button>
        </form>
      )}
    </section>
  );
}

export function AdminTournament() {
  const { id } = useParams();
  const l = useLoad(`/tournaments/${id}`);
  const [tab, setTab] = useState("Teams & players"),
    [error, setError] = useState("");
  async function advance(t) {
    const status = {
      draft: "upcoming",
      upcoming: "active",
      active: "completed",
    }[t.status];
    if (
      !window.confirm(
        `Move tournament to ${status}? This lifecycle change cannot be reversed.`,
      )
    )
      return;
    try {
      await api(`/tournaments/${id}/status`, {
        method: "PATCH",
        body: { status },
      });
      l.reload();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Async load={l}>
      {(t) => (
        <section className="section">
          <p className="eyebrow">ADMIN STUDIO / {t.college}</p>
          <div className="section-heading">
            <h1>{t.name}</h1>
            <Badge>{t.status}</Badge>
          </div>
          {error && <Notice error>{error}</Notice>}
          <div className="actions">
            <Link className="button secondary" to={`/admin/${id}/edit`}>
              Edit rules
            </Link>
            {t.status !== "completed" && (
              <button onClick={() => advance(t)}>
                Advance to{" "}
                {
                  {
                    draft: "upcoming",
                    upcoming: "active",
                    active: "completed",
                  }[t.status]
                }{" "}
                ↗
              </button>
            )}
            <Link to={`/tournaments/${id}`}>Public tournament ↗</Link>
          </div>
          <div className="tabs">
            {[
              "Teams & players",
              "Fixtures",
              "Participation",
              "Leaderboard",
            ].map((v) => (
              <button
                key={v}
                className={tab === v ? "selected" : ""}
                onClick={() => setTab(v)}
              >
                {v}
              </button>
            ))}
          </div>
          {tab === "Teams & players" && <RosterAdmin tournament={id} />}
          {tab === "Fixtures" && <FixtureAdmin tournament={id} />}
          {tab === "Participation" && <Participation tournament={id} />}
          {tab === "Leaderboard" && <Leaderboard tournament={id} />}
        </section>
      )}
    </Async>
  );
}

export function Participation({ tournament }) {
  const l = useLoad(`/tournaments/${tournament}/participation`, { all: true });
  return (
    <Async load={l}>
      {(ss) =>
        ss.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Manager</th>
                  <th>Selected</th>
                  <th>Starters</th>
                  <th>Complete</th>
                </tr>
              </thead>
              <tbody>
                {ss.map((s) => (
                  <tr key={s._id}>
                    <td>{s.user.name}</td>
                    <td>{s.players.length}</td>
                    <td>{s.starters.length}</td>
                    <td>{s.complete ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No participants yet.</Empty>
        )
      }
    </Async>
  );
}

export function RosterAdmin({ tournament }) {
  const teams = useLoad(`/tournaments/${tournament}/teams`, { all: true });
  const players = useLoad(`/tournaments/${tournament}/players`, { all: true });
  const [team, setTeam] = useState({ name: "", shortName: "", logoUrl: "" }),
    [player, setPlayer] = useState({
      name: "",
      position: "MID",
      auctionPrice: 0,
      fantasyPrice: 0,
      jerseyNumber: 1,
      photoUrl: "",
    }),
    [teamId, setTeamId] = useState(""),
    [editTeam, setEditTeam] = useState(""),
    [editPlayer, setEditPlayer] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [importJson, setImportJson] = useState(""),
    [busy, setBusy] = useState(false);
  async function perform(fn) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await fn();
      teams.reload();
      players.reload();
      setMessage(result || "Roster updated.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function deleteRecord(path) {
    if (
      window.confirm(
        "Delete this record? Records with references cannot be deleted.",
      )
    )
      perform(() => api(path, { method: "DELETE" }));
  }
  return (
    <div className="stack">
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          perform(async () => {
            let roster;
            try {
              roster = JSON.parse(importJson);
            } catch {
              throw new Error("Import must be valid JSON.");
            }
            const result = await api(
              `/tournaments/${tournament}/roster/import`,
              { method: "POST", body: roster },
            );
            setImportJson("");
            const teamLabel = result.teams === 1 ? "team" : "teams";
            const playerLabel = result.players === 1 ? "player" : "players";
            return `Imported ${result.teams} ${teamLabel} and ${result.players} ${playerLabel}.`;
          });
        }}
      >
        <div>
          <h2>Import teams and players</h2>
          <p>
            Add multiple teams and their players in one JSON import. It will
            create new records only; team names and short names must not already
            exist in this tournament. Maximum 100 teams and 1,000 players.
          </p>
        </div>
        <details>
          <summary>View JSON format</summary>
          <pre className="import-example">{`{
  "teams": [
    {
      "name": "Falcons",
      "shortName": "FAL",
      "players": [
        {
          "name": "Aarav Sharma",
          "position": "FWD",
          "auctionPrice": 500000,
          "fantasyPrice": 120000,
          "jerseyNumber": 10
        }
      ]
    }
  ]
}`}</pre>
          <small>
            Positions: GK, DEF, MID, FWD. Prices must be whole numbers. Optional
            fields: logoUrl, photoUrl, jerseyNumber.
          </small>
        </details>
        <Field label="Roster JSON">
          <textarea
            aria-label="Roster JSON"
            required
            rows={12}
            spellCheck={false}
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"teams":[...]}'
          />
        </Field>
        <button disabled={busy || !importJson.trim()}>
          {busy ? "Importing…" : "Import roster"}
        </button>
      </form>
      <div className="grid two">
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            perform(async () => {
              await api(
                editTeam
                  ? `/teams/${editTeam}`
                  : `/tournaments/${tournament}/teams`,
                { method: editTeam ? "PUT" : "POST", body: team },
              );
              setEditTeam("");
              setTeam({ name: "", shortName: "", logoUrl: "" });
            });
          }}
        >
          <h2>{editTeam ? "Edit team" : "Register a team"}</h2>
          <Field
            label="Team name"
            required
            value={team.name}
            onChange={(e) => setTeam({ ...team, name: e.target.value })}
          />
          <Field
            label="Short name (2–6 characters)"
            required
            minLength={2}
            maxLength={6}
            value={team.shortName}
            onChange={(e) => setTeam({ ...team, shortName: e.target.value })}
          />
          <Field
            label="Logo URL (optional)"
            type="url"
            value={team.logoUrl}
            onChange={(e) => setTeam({ ...team, logoUrl: e.target.value })}
          />
          <button disabled={busy}>
            {editTeam ? "Save team" : "Add team +"}
          </button>
          {editTeam && (
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setEditTeam("");
                setTeam({ name: "", shortName: "", logoUrl: "" });
              }}
            >
              Cancel edit
            </button>
          )}
        </form>
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            perform(async () => {
              await api(
                editPlayer
                  ? `/players/${editPlayer}`
                  : `/teams/${teamId}/players`,
                { method: editPlayer ? "PUT" : "POST", body: player },
              );
              setEditPlayer("");
              setPlayer({ ...player, name: "" });
            });
          }}
        >
          <h2>{editPlayer ? "Edit player" : "Register a player"}</h2>
          <Field label="Real-world team">
            <select
              required
              disabled={!!editPlayer}
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">Select team</option>
              {teams.data?.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Player name"
            required
            value={player.name}
            onChange={(e) => setPlayer({ ...player, name: e.target.value })}
          />
          <div className="grid two">
            <Field label="Position">
              <select
                value={player.position}
                onChange={(e) =>
                  setPlayer({ ...player, position: e.target.value })
                }
              >
                {["GK", "DEF", "MID", "FWD"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Jersey number"
              type="number"
              min="0"
              max="999"
              value={player.jerseyNumber}
              onChange={(e) =>
                setPlayer({ ...player, jerseyNumber: +e.target.value })
              }
            />
            <Field
              label="Auction price (₹)"
              type="number"
              min="0"
              required
              value={player.auctionPrice}
              onChange={(e) =>
                setPlayer({ ...player, auctionPrice: +e.target.value })
              }
            />
            <Field
              label="Fantasy price (₹)"
              type="number"
              min="0"
              required
              value={player.fantasyPrice}
              onChange={(e) =>
                setPlayer({ ...player, fantasyPrice: +e.target.value })
              }
            />
          </div>
          <Field
            label="Photo URL (optional)"
            type="url"
            value={player.photoUrl}
            onChange={(e) => setPlayer({ ...player, photoUrl: e.target.value })}
          />
          <button disabled={busy}>
            {editPlayer ? "Save player" : "Add player +"}
          </button>
          {editPlayer && (
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setEditPlayer("");
                setPlayer({
                  name: "",
                  position: "MID",
                  auctionPrice: 0,
                  fantasyPrice: 0,
                  jerseyNumber: 1,
                  photoUrl: "",
                });
              }}
            >
              Cancel edit
            </button>
          )}
        </form>
      </div>
      <h2>Registered teams</h2>
      <Async load={teams}>
        {(ts) =>
          ts.length ? (
            <div className="grid three">
              {ts.map((t) => (
                <article className="panel" key={t._id}>
                  <h3>
                    {t.name} · {t.shortName}
                  </h3>
                  <div className="actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditTeam(t._id);
                        setTeam({
                          name: t.name,
                          shortName: t.shortName,
                          logoUrl: t.logoUrl || "",
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="danger"
                      onClick={() => deleteRecord(`/teams/${t._id}`)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty>No teams yet.</Empty>
          )
        }
      </Async>
      <h2>Player registry</h2>
      <Async load={players}>
        {(ps) =>
          ps.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th>Position</th>
                    <th>Auction</th>
                    <th>Fantasy</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ps.map((p) => (
                    <tr key={p._id}>
                      <td>{p.name}</td>
                      <td>{p.team.shortName}</td>
                      <td>
                        <Badge>{p.position}</Badge>
                      </td>
                      <td>{rupees(p.auctionPrice)}</td>
                      <td>{rupees(p.fantasyPrice)}</td>
                      <td>
                        <button
                          className="quiet"
                          onClick={() => {
                            setEditPlayer(p._id);
                            setTeamId(p.team._id);
                            setPlayer({
                              name: p.name,
                              position: p.position,
                              auctionPrice: p.auctionPrice,
                              fantasyPrice: p.fantasyPrice,
                              jerseyNumber: p.jerseyNumber ?? 0,
                              photoUrl: p.photoUrl || "",
                            });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="quiet danger"
                          onClick={() => deleteRecord(`/players/${p._id}`)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No players registered yet.</Empty>
          )
        }
      </Async>
    </div>
  );
}

export function FixtureAdmin({ tournament }) {
  const teams = useLoad(`/tournaments/${tournament}/teams`, { all: true });
  const [v, setV] = useState({
      homeTeam: "",
      awayTeam: "",
      scheduledAt: "",
      venue: "",
    }),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api(`/tournaments/${tournament}/matches`, {
        method: "POST",
        body: { ...v, scheduledAt: new Date(v.scheduledAt).toISOString() },
      });
      setMessage("Match scheduled.");
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form onSubmit={submit} className="panel stack">
        <h2>Set up the next match</h2>
        {error && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        <div className="grid two">
          {["homeTeam", "awayTeam"].map((k) => (
            <Field key={k} label={k === "homeTeam" ? "Home team" : "Away team"}>
              <select
                required
                value={v[k]}
                onChange={(e) => setV({ ...v, [k]: e.target.value })}
              >
                <option value="">Select team</option>
                {teams.data?.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field
            label="Kickoff (your local time)"
            type="datetime-local"
            required
            value={v.scheduledAt}
            onChange={(e) => setV({ ...v, scheduledAt: e.target.value })}
          />
          <Field
            label="Venue"
            value={v.venue}
            onChange={(e) => setV({ ...v, venue: e.target.value })}
          />
        </div>
        <button disabled={busy}>Schedule match +</button>
      </form>
      <Fixtures tournament={tournament} key={revision} />
    </>
  );
}
