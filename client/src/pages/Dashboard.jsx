import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { api, rupees } from "../api";
import { Session } from "../session";
import {
  Badge,
  Notice,
  Empty,
  Loading,
  useLoad,
  Async,
  Stat,
} from "../components";
import { Fixtures } from "./Tournaments";

export function Dashboard() {
  const { user } = useContext(Session);
  const l = useLoad("/my-squads");
  return (
    <section className="section">
      <p className="eyebrow">YOUR HOME GROUND</p>
      <h1>
        Match day energy,
        <br />
        <em>{user.name.split(" ")[0]}.</em>
      </h1>
      <p className="lede">Your squads, your scores, your next big moment.</p>
      <Async load={l}>
        {(squads) =>
          squads.length ? (
            <div className="stack">
              {squads.map((s) => (
                <div className="panel" key={s._id}>
                  <div className="section-heading">
                    <div>
                      <Badge>{s.tournament.status}</Badge>
                      <h2>
                        <Link to={`/tournaments/${s.tournament._id}`}>
                          {s.tournament.name}
                        </Link>
                      </h2>
                    </div>
                    <Link
                      className="button small"
                      to={`/tournaments/${s.tournament._id}/squad`}
                    >
                      {s.complete ? "View squad" : "Finish squad"} ↗
                    </Link>
                  </div>
                  <div className="stats">
                    <Stat
                      label="Squad"
                      value={`${s.players.length}/${s.tournament.squadSize}`}
                    />
                    <Stat
                      label="Remaining budget"
                      value={rupees(
                        s.tournament.budget -
                          s.players.reduce((n, p) => n + p.fantasyPrice, 0),
                      )}
                    />
                    <Stat
                      label="Status"
                      value={s.complete ? "Complete" : "In progress"}
                    />
                  </div>
                  <MyPerformance tournament={s.tournament._id} />
                  <details>
                    <summary>Fixtures and recent results</summary>
                    <Fixtures tournament={s.tournament._id} />
                  </details>
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              Your team sheet is waiting.{" "}
              <Link to="/tournaments">Find a tournament ↗</Link>
            </Empty>
          )
        }
      </Async>
    </section>
  );
}

export function MyPerformance({ tournament }) {
  const [data, setData] = useState(undefined),
    [error, setError] = useState("");
  useEffect(() => {
    api(`/tournaments/${tournament}/my-performance`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [tournament]);
  if (error) return <Notice error>{error}</Notice>;
  if (data === undefined) return <Loading />;
  if (!data)
    return (
      <p className="muted">
        Complete your squad to enter the official leaderboard.
      </p>
    );
  return (
    <>
      <div className="stats">
        <Stat label="Total points" value={data.points} />
        <Stat label="Tournament rank" value={`#${data.rank}`} />
        <Stat label="Matches counted" value={data.matchesCounted} />
      </div>
      <details>
        <summary>Player points breakdown</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Base</th>
                <th>Multiplier</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {data.details.map((p) => (
                <tr key={p.player}>
                  <td>
                    {p.name} <Badge>{p.role}</Badge>
                  </td>
                  <td>{p.base}</td>
                  <td>
                    ×{p.multiplier}
                    {p.multiplier === 0 ? " (bench)" : ""}
                  </td>
                  <td>{p.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
