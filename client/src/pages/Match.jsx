import React, { useState, useEffect, useContext } from "react";
import { Link, useParams } from "react-router-dom";
import { api, date } from "../api";
import { Session } from "../session";
import { Field, Badge, Notice, Empty, useLoad, Async } from "../components";

export function MatchPage() {
  const { id } = useParams();
  const { user } = useContext(Session);
  const [pollLive, setPollLive] = useState(false);
  const match = useLoad(`/matches/${id}`, { pollMs: pollLive ? 5000 : 0 });
  useEffect(() => {
    setPollLive(match.data?.status === "live");
  }, [match.data?.status]);
  const events = useLoad(`/matches/${id}/events`, {
      all: true,
      pollMs: pollLive ? 5000 : 0,
    }),
    points = useLoad(`/matches/${id}/live-performance`, {
      pollMs: pollLive ? 5000 : 0,
    });
  return (
    <section className="section">
      <Async load={match}>
        {(m) => (
          <>
            <p className="eyebrow">MATCH CENTRE</p>
            <div className="match-score" aria-live="polite">
              <h1>{m.homeTeam.name}</h1>
              <div>
                <Badge>{m.status}</Badge>
                <strong>
                  {m.homeScore} : {m.awayScore}
                </strong>
              </div>
              <h1>{m.awayTeam.name}</h1>
            </div>
            <p className="center">
              {date(m.scheduledAt)} · {m.venue || "Venue to be announced"}
            </p>
            {m.status === "live" && (
              <Notice>
                Live scores and event updates are refreshed automatically.
                Fantasy points are provisional until the match is completed.
              </Notice>
            )}
            {user?.role === "admin" && (
              <MatchAdmin
                match={m}
                reload={() => {
                  match.reload();
                  events.reload();
                  points.reload();
                }}
                events={events.data || []}
              />
            )}
            <div className="panel">
              <h2>The match timeline</h2>
              <Async load={events}>
                {(es) =>
                  es.length ? (
                    <ol className="timeline" aria-live="polite">
                      {es.map((e) => (
                        <li key={e._id}>
                          <b>{e.minute}′</b>
                          <div>
                            <Badge>{e.type.replace(/([A-Z])/g, " $1")}</Badge>
                            <p>
                              <Link
                                to={`/players/${e.player._id}`}
                                state={{
                                  returnTo: window.location.pathname,
                                }}
                              >
                                {e.player.name}
                              </Link>
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <Empty>No match events recorded.</Empty>
                  )
                }
              </Async>
            </div>
            {["live", "completed"].includes(m.status) && (
              <div className="panel live-points">
                <h2>
                  {m.status === "live"
                    ? "Provisional fantasy-team points"
                    : "Final fantasy-team points"}
                </h2>
                <p>
                  {m.status === "live"
                    ? "Live points may change as events are recorded or corrected."
                    : "Match points are finalized and included in tournament standings."}
                </p>
                <Async load={points}>
                  {(result) =>
                    result.rows.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Rank</th>
                              <th>Manager</th>
                              <th>
                                {result.provisional
                                  ? "Provisional points"
                                  : "Final points"}
                              </th>
                              <th>Scoring players</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.rows.map((row) => (
                              <tr key={row.user}>
                                <td>{row.rank}</td>
                                <td>{row.name}</td>
                                <td>{row.points}</td>
                                <td>
                                  {row.details
                                    .map(
                                      (detail) =>
                                        `${detail.name} (${detail.points})`,
                                    )
                                    .join(", ") || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty>No completed fantasy squads yet.</Empty>
                    )
                  }
                </Async>
              </div>
            )}
          </>
        )}
      </Async>
    </section>
  );
}

export function MatchAdmin({ match: m, reload, events }) {
  const homePlayers = useLoad(`/teams/${m.homeTeam._id}/players`, {
      all: true,
    }),
    awayPlayers = useLoad(`/teams/${m.awayTeam._id}/players`, { all: true }),
    teams = useLoad(`/tournaments/${m.tournament}/teams`, { all: true });
  const [v, setV] = useState({
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.status === "scheduled" ? "live" : m.status,
  });
  useEffect(() => {
    setV((current) => ({
      ...current,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status === "scheduled" ? "live" : m.status,
    }));
  }, [m.homeScore, m.awayScore, m.status]);
  const [fixture, setFixture] = useState({
    homeTeam: m.homeTeam._id,
    awayTeam: m.awayTeam._id,
    scheduledAt: new Date(
      new Date(m.scheduledAt).getTime() -
        new Date(m.scheduledAt).getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16),
    venue: m.venue || "",
  });
  const [event, setEvent] = useState({
      player: "",
      type: "goal",
      minute: 0,
      relatedGoal: null,
    }),
    [edit, setEdit] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const eligible = [
    ...(homePlayers.data || []).map((p) => ({
      ...p,
      team: { shortName: m.homeTeam.shortName },
    })),
    ...(awayPlayers.data || []).map((p) => ({
      ...p,
      team: { shortName: m.awayTeam.shortName },
    })),
  ];
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel" open>
      <summary>Administrator match controls</summary>
      {error && <Notice error>{error}</Notice>}
      <div className="grid two">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              v.status === "cancelled" &&
              !window.confirm("Cancel this match?")
            )
              return;
            run(() =>
              api(`/matches/${m._id}/result`, { method: "PUT", body: v }),
            );
          }}
        >
          <h3>Official result</h3>
          <div className="grid two">
            <Field
              label="Home score"
              type="number"
              min="0"
              required
              value={v.homeScore}
              onChange={(e) => setV({ ...v, homeScore: +e.target.value })}
            />
            <Field
              label="Away score"
              type="number"
              min="0"
              required
              value={v.awayScore}
              onChange={(e) => setV({ ...v, awayScore: +e.target.value })}
            />
          </div>
          <Field label="Status">
            <select
              value={v.status}
              onChange={(e) => setV({ ...v, status: e.target.value })}
            >
              {["live", "completed", "cancelled"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <button disabled={busy}>Save official result</button>
          <small>
            Record goals before finalizing. The final score must match goal
            events. Corrections to finalized goal events update the displayed
            score.
          </small>
        </form>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api(
                edit ? `/match-events/${edit}` : `/matches/${m._id}/events`,
                { method: edit ? "PUT" : "POST", body: event },
              );
              setEdit("");
              setEvent({
                player: "",
                type: "goal",
                minute: 0,
                relatedGoal: null,
              });
            });
          }}
        >
          <h3>{edit ? "Correct event" : "Record a contribution"}</h3>
          <Field label="Player">
            <select
              required
              value={event.player}
              onChange={(e) => setEvent({ ...event, player: e.target.value })}
            >
              <option value="">Select participating player</option>
              {eligible.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} · {p.team.shortName}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid two">
            <Field label="Event type">
              <select
                value={event.type}
                onChange={(e) =>
                  setEvent({
                    ...event,
                    type: e.target.value,
                    relatedGoal: null,
                  })
                }
              >
                {[
                  ["goal", "Goal"],
                  ["assist", "Assist"],
                  ["ownGoal", "Own goal"],
                  ["yellowCard", "Yellow card"],
                  ["redCard", "Red card"],
                  ["penaltySave", "Penalty saved"],
                  ["goalkeeperSave", "Goalkeeper save"],
                  ["shotOnTarget", "Shot on target"],
                  ["penaltyMissed", "Penalty missed"],
                  ["playerOfTheMatch", "Player of the match"],
                  ["cleanSheet", "Clean sheet"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Minute"
              type="number"
              min="0"
              max="150"
              value={event.minute}
              onChange={(e) => setEvent({ ...event, minute: +e.target.value })}
            />
          </div>
          {event.type === "assist" && (
            <Field label="Assisted goal">
              <select
                required
                value={event.relatedGoal || ""}
                onChange={(e) =>
                  setEvent({ ...event, relatedGoal: e.target.value })
                }
              >
                <option value="">Select recorded goal</option>
                {events
                  .filter((e) => e.type === "goal")
                  .map((e) => (
                    <option key={e._id} value={e._id}>
                      {e.minute}′ · {e.player.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <button disabled={busy}>
            {edit ? "Save correction" : "Record event +"}
          </button>
          {edit && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEdit("");
                setEvent({
                  player: "",
                  type: "goal",
                  minute: 0,
                  relatedGoal: null,
                });
              }}
            >
              Cancel correction
            </button>
          )}
        </form>
      </div>
      {events.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Minute</th>
                <th>Event</th>
                <th>Player</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e._id}>
                  <td>{e.minute}</td>
                  <td>{e.type}</td>
                  <td>{e.player.name}</td>
                  <td>
                    <button
                      className="quiet"
                      onClick={() => {
                        setEdit(e._id);
                        setEvent({
                          player: e.player._id,
                          type: e.type,
                          minute: e.minute,
                          relatedGoal: e.relatedGoal || null,
                        });
                      }}
                    >
                      Correct
                    </button>
                    <button
                      className="quiet danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Delete this event? Fantasy points will be recalculated.",
                          )
                        )
                          run(() =>
                            api(`/match-events/${e._id}`, { method: "DELETE" }),
                          );
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {m.status === "scheduled" && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              api(`/matches/${m._id}`, {
                method: "PUT",
                body: {
                  ...fixture,
                  scheduledAt: new Date(fixture.scheduledAt).toISOString(),
                },
              }),
            );
          }}
        >
          <h3>Edit scheduled fixture</h3>
          <div className="grid two">
            {["homeTeam", "awayTeam"].map((k) => (
              <Field
                key={k}
                label={k === "homeTeam" ? "Home team" : "Away team"}
              >
                <select
                  value={fixture[k]}
                  onChange={(e) =>
                    setFixture({ ...fixture, [k]: e.target.value })
                  }
                >
                  {teams.data?.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <Field
              label="Kickoff (local time)"
              type="datetime-local"
              required
              value={fixture.scheduledAt}
              onChange={(e) =>
                setFixture({ ...fixture, scheduledAt: e.target.value })
              }
            />
            <Field
              label="Venue"
              value={fixture.venue}
              onChange={(e) =>
                setFixture({ ...fixture, venue: e.target.value })
              }
            />
          </div>
          <button disabled={busy}>Update fixture</button>
        </form>
      )}
    </details>
  );
}
