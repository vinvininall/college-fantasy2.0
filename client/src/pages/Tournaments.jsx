import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { rupees, date } from "../api";

import { Field, Badge, Empty, useLoad, Async, Stat } from "../components";

export function TournamentCard({ t }) {
  return (
    <Link className="tournament-card" to={`/tournaments/${t._id}`}>
      <div className="card-art">
        <span className="cup">♜</span>
        <span className="format">
          {t.format}
          <br />
          <small>FOOTBALL</small>
        </span>
        <Badge>{t.status}</Badge>
      </div>
      <div className="card-body">
        <p className="eyebrow">{t.college}</p>
        <h3>{t.name}</h3>
        <div className="card-meta">
          <span>{t.squadSize} player squad</span>
          <span>{rupees(t.budget)}</span>
        </div>
        <div className="card-link">
          Explore tournament <span>↗</span>
        </div>
      </div>
    </Link>
  );
}

export function TournamentList() {
  const [page, setPage] = useState(1);
  const load = useLoad(`/tournaments?page=${page}&limit=12`);
  return (
    <section className="section">
      <p className="eyebrow">PICK YOUR COMPETITION</p>
      <h1>
        The tournament
        <br />
        <em>starts with you.</em>
      </h1>
      <p className="lede">
        Different campuses. Different formats. The same love for the game.
      </p>
      <Async load={load}>
        {(data) => (
          <>
            {data.length ? (
              <div className="grid three">
                {data.map((t) => (
                  <TournamentCard key={t._id} t={t} />
                ))}
              </div>
            ) : (
              <Empty>No tournaments on this page.</Empty>
            )}
            <div className="actions">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                disabled={data.length < 12}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </Async>
    </section>
  );
}

export function TournamentPage() {
  const { id } = useParams();
  const load = useLoad(`/tournaments/${id}`),
    [tab, setTab] = useState("Overview");
  return (
    <Async load={load}>
      {(t) => (
        <>
          <section className="tournament-hero">
            <div>
              <p className="eyebrow">{t.college}</p>
              <h1>{t.name}</h1>
              <p>{t.description}</p>
              <Badge>{t.status}</Badge>
            </div>
            <div>
              <span className="big-format">{t.format}</span>
              <Link className="button" to={`/tournaments/${id}/squad`}>
                My fantasy squad ↗
              </Link>
            </div>
          </section>
          <div className="tabs" role="tablist">
            {["Overview", "Players", "Teams", "Fixtures", "Leaderboard"].map(
              (v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={tab === v}
                  className={tab === v ? "selected" : ""}
                  onClick={() => setTab(v)}
                >
                  {v}
                </button>
              ),
            )}
          </div>
          <section className="section">
            {tab === "Overview" && (
              <>
                <div className="stats">
                  <Stat label="Fantasy budget" value={rupees(t.budget)} />
                  <Stat label="Squad size" value={`${t.squadSize} players`} />
                  <Stat label="Starting lineup" value={t.startingPlayers} />
                  <Stat label="Bench places" value={t.substitutes} />
                </div>
                <div className="grid two">
                  <div className="panel">
                    <h2>The game plan</h2>
                    <p>
                      Only starting players score. Captain ×{t.scoring.captain};
                      vice-captain ×{t.scoring.viceCaptain}. Finalized points
                      count from completed matches.
                    </p>
                    <h3>Permitted formations</h3>
                    {t.formationPolicy === "unrestricted" ? (
                      <p>Unrestricted positional selection.</p>
                    ) : (
                      t.formations.map((f) => (
                        <p key={f.name}>
                          {f.name} — {f.GK} GK · {f.DEF} DEF · {f.MID} MID ·{" "}
                          {f.FWD} FWD
                        </p>
                      ))
                    )}
                    <p>
                      Squads lock when the tournament becomes active or the
                      first fixture kicks off.
                    </p>
                  </div>
                  <div className="panel">
                    <h2>Every contribution counts</h2>
                    <div className="score-rules">
                      {Object.entries(t.scoring.goal).map(([p, n]) => (
                        <div key={p}>
                          <span>{p} goal</span>
                          <b>+{n}</b>
                        </div>
                      ))}
                      {Object.entries(t.scoring)
                        .filter(
                          ([k]) =>
                            !["goal", "captain", "viceCaptain"].includes(k),
                        )
                        .map(([k, n]) => (
                          <div key={k}>
                            <span>{k.replace(/([A-Z])/g, " $1")}</span>
                            <b>
                              {n > 0 ? "+" : ""}
                              {n}
                            </b>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {tab === "Players" && <PlayerBrowser tournament={id} />}
            {tab === "Teams" && <Teams tournament={id} />}
            {tab === "Fixtures" && <Fixtures tournament={id} />}
            {tab === "Leaderboard" && <Leaderboard tournament={id} />}
          </section>
        </>
      )}
    </Async>
  );
}

export function PlayerBrowser({ tournament, selected = [], onToggle }) {
  const [search, setSearch] = useState(""),
    [position, setPosition] = useState(""),
    [team, setTeam] = useState(""),
    [page, setPage] = useState(1);
  const teams = useLoad(`/tournaments/${tournament}/teams`, { all: true });
  const load = useLoad(
    `/tournaments/${tournament}/players?limit=24&page=${page}&search=${encodeURIComponent(search)}${position ? `&position=${position}` : ""}${team ? `&team=${team}` : ""}`,
  );
  return (
    <>
      <div className="filters">
        <Field
          label="Search players"
          value={search}
          placeholder="Find your next game changer…"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Field label="Position">
          <select
            value={position}
            onChange={(e) => {
              setPosition(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All positions</option>
            {["GK", "DEF", "MID", "FWD"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Team">
          <select
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All teams</option>
            {teams.data?.map((t) => (
              <option value={t._id} key={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Async load={load}>
        {(players) => (
          <>
            {players.length ? (
              <div className="player-grid">
                {players.map((p) => (
                  <article className="player-card" key={p._id}>
                    <div className={`player-icon ${p.position}`}>
                      {p.jerseyNumber || "✳"}
                    </div>
                    <div>
                      <Badge>{p.position}</Badge>
                      <h3>
                        <Link to={`/players/${p._id}`}>{p.name}</Link>
                      </h3>
                      <small>{p.team.name}</small>
                      <strong>{rupees(p.fantasyPrice)}</strong>
                    </div>
                    {onToggle && (
                      <button
                        className={selected.includes(p._id) ? "remove" : "add"}
                        aria-label={`${selected.includes(p._id) ? "Remove" : "Add"} ${p.name}`}
                        onClick={() => onToggle(p)}
                      >
                        {selected.includes(p._id) ? "−" : "+"}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <Empty>No players match your filters.</Empty>
            )}
            <div className="actions">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                disabled={players.length < 24}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </Async>
    </>
  );
}

export function Teams({ tournament }) {
  const l = useLoad(`/tournaments/${tournament}/teams`, { all: true });
  return (
    <Async load={l}>
      {(teams) =>
        teams.length ? (
          <div className="grid three">
            {teams.map((t) => (
              <Link
                className="panel team-card"
                to={`/teams/${t._id}`}
                key={t._id}
              >
                <span className="shield">{t.shortName}</span>
                <h3>{t.name}</h3>
                <span>View squad ↗</span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty>No teams registered yet.</Empty>
        )
      }
    </Async>
  );
}

export function TeamPage() {
  const { id } = useParams();
  const team = useLoad(`/teams/${id}`),
    players = useLoad(`/teams/${id}/players`, { all: true });
  return (
    <section className="section">
      <Async load={team}>
        {(t) => (
          <>
            <Link className="text-link" to={`/tournaments/${t.tournament}`}>
              ← Tournament
            </Link>
            <h1>{t.name}</h1>
            <Async load={players}>
              {(ps) => (
                <div className="grid three">
                  {ps.map((p) => (
                    <Link
                      className="panel"
                      key={p._id}
                      to={`/players/${p._id}`}
                    >
                      <Badge>{p.position}</Badge>
                      <h3>{p.name}</h3>
                      <p>Fantasy {rupees(p.fantasyPrice)}</p>
                      <small>Auction {rupees(p.auctionPrice)}</small>
                    </Link>
                  ))}
                </div>
              )}
            </Async>
          </>
        )}
      </Async>
    </section>
  );
}

export function PlayerPage() {
  const { id } = useParams();
  const load = useLoad(`/players/${id}`);
  return (
    <section className="section">
      <Async load={load}>
        {(p) => (
          <>
            <p className="eyebrow">
              {p.team.name} · #{p.jerseyNumber || "—"}
            </p>
            <h1>{p.name}</h1>
            <Badge>{p.position}</Badge>
            <div className="stats">
              <Stat label="Fantasy price" value={rupees(p.fantasyPrice)} />
              <Stat label="Auction price" value={rupees(p.auctionPrice)} />
            </div>
            <PlayerPerformance tournament={p.team.tournament} player={p._id} />
          </>
        )}
      </Async>
    </section>
  );
}

export function PlayerPerformance({ tournament, player }) {
  const l = useLoad(`/tournaments/${tournament}/players/${player}/performance`);
  return (
    <Async load={l}>
      {(p) => (
        <div className="panel">
          <h2>Performance · {p.points || 0} pts</h2>
          <p>
            {p.events?.filter((e) => e.type === "goal").length || 0} goals ·{" "}
            {p.events?.filter((e) => e.type === "assist").length || 0} assists ·{" "}
            {p.events?.filter((e) => ["yellowCard", "redCard"].includes(e.type))
              .length || 0}{" "}
            cards
          </p>
          {p.matches.length ? (
            p.matches.map((m) => (
              <p key={m.match}>
                <Link to={`/matches/${m.match}`}>{date(m.scheduledAt)}</Link> ·{" "}
                {m.points} pts
              </p>
            ))
          ) : (
            <Empty>No completed matches yet.</Empty>
          )}
        </div>
      )}
    </Async>
  );
}

export function Fixtures({ tournament }) {
  const [status, setStatus] = useState(""),
    [team, setTeam] = useState(""),
    [page, setPage] = useState(1);
  const teams = useLoad(`/tournaments/${tournament}/teams`, { all: true });
  const l = useLoad(
    `/tournaments/${tournament}/matches?limit=24&page=${page}${status ? `&status=${status}` : ""}${team ? `&team=${team}` : ""}`,
  );
  return (
    <>
      <div className="filters">
        <Field label="Match status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All matches</option>
            {["scheduled", "live", "completed", "cancelled"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Team">
          <select
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All teams</option>
            {teams.data?.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Async load={l}>
        {(ms) => (
          <>
            {ms.length ? (
              <div className="fixture-list">
                {ms.map((m) => (
                  <Link
                    className="fixture"
                    to={`/matches/${m._id}`}
                    key={m._id}
                  >
                    <div>
                      <Badge>{m.status}</Badge>
                      <small>{date(m.scheduledAt)}</small>
                    </div>
                    <h3>
                      {m.homeTeam.name}{" "}
                      <span>
                        {["completed", "live"].includes(m.status)
                          ? `${m.homeScore} : ${m.awayScore}`
                          : "vs"}
                      </span>{" "}
                      {m.awayTeam.name}
                    </h3>
                    <p>{m.venue || "Venue to be announced"} ↗</p>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>No fixtures here yet.</Empty>
            )}
            <div className="actions">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                disabled={ms.length < 24}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </Async>
    </>
  );
}

export function Leaderboard({ tournament }) {
  const [page, setPage] = useState(1);
  const l = useLoad(
    `/tournaments/${tournament}/leaderboard?page=${page}&limit=50`,
  );
  return (
    <>
      <div className="section-heading">
        <h2>The campus standings</h2>
        <span>Finalized matches only</span>
      </div>
      <Async load={l}>
        {(rows) => (
          <>
            {rows.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Manager</th>
                      <th>Matches counted</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.user}>
                        <td className="rank">
                          {r.rank === 1 ? "♛ " : ""}
                          {r.rank}
                        </td>
                        <td>{r.name}</td>
                        <td>{r.matchesCounted}</td>
                        <td>
                          <b>{r.points}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>
                No eligible squads yet. Complete your squad to join the
                standings.
              </Empty>
            )}
            <div className="actions">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                disabled={rows.length < 50}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </Async>
    </>
  );
}
