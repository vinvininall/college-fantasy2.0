import React from "react";
import { Link } from "react-router-dom";

import { Empty, useLoad, Async } from "../components";
import { TournamentCard } from "./Tournaments";

export function Landing() {
  const load = useLoad("/tournaments?limit=3");
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">
            <span className="dot" /> THE CAMPUS IS YOUR PLAYGROUND
          </p>
          <h1>
            Your campus.
            <br />
            Your squad.
            <br />
            <em>Your glory.</em>
          </h1>
          <p className="hero-copy">
            Know the players. Back your instincts. Build your dream squad and
            turn every campus match into your game.
          </p>
          <div className="actions">
            <Link className="button" to="/tournaments">
              Find your tournament <span>↗</span>
            </Link>
            <a className="text-link" href="#how-it-works">
              How to play ↓
            </a>
          </div>
          <div className="hero-note">
            <span>01 / PICK</span>
            <span>02 / PLAY</span>
            <span>03 / CLIMB</span>
          </div>
        </div>
        <div className="hero-art" aria-label="Illustration of a football pitch">
          <div className="art-top">
            <span>
              THE NEXT BIG THING
              <br />
              IS ON YOUR CAMPUS.
            </span>
            <span>↗</span>
          </div>
          <div className="pitch">
            <div className="half" />
            <div className="circle" />
            <div className="goal top" />
            <div className="goal bottom" />
            <div className="shirt s1">01</div>
            <div className="shirt s2">04</div>
            <div className="shirt s3">08</div>
            <div className="shirt s4">10</div>
            <div className="ball">✳</div>
          </div>
          <div className="art-bottom">
            <b>
              EVERY MATCH.
              <br />A NEW POSSIBILITY.
            </b>
            <span>✳</span>
          </div>
        </div>
      </section>
      <div className="ticker">
        <span>REAL PLAYERS</span>✳<span>REAL RIVALRIES</span>✳
        <span>YOUR FANTASY XI</span>✳<span>CAMPUS FOOTBALL</span>✳
        <span>BIG MATCH ENERGY</span>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FIND YOUR FIELD</p>
            <h2>One campus. Endless possibilities.</h2>
          </div>
          <Link className="text-link" to="/tournaments">
            All tournaments ↗
          </Link>
        </div>
        <Async load={load}>
          {(data) =>
            data.length ? (
              <div className="grid three">
                {data.map((t) => (
                  <TournamentCard key={t._id} t={t} />
                ))}
              </div>
            ) : (
              <Empty>No tournaments yet. Your next rivalry starts here.</Empty>
            )
          }
        </Async>
      </section>
      <section className="how section" id="how-it-works">
        <p className="eyebrow">YOUR GAME PLAN</p>
        <h2>
          Football instincts.
          <br />
          Fantasy bragging rights.
        </h2>
        <div className="grid three">
          {[
            [
              "01",
              "Find your rivalry",
              "Join your college tournament. Every competition has its own rules, format and budget.",
            ],
            [
              "02",
              "Build your dream squad",
              "Pick your players, set your lineup and give your captain the armband.",
            ],
            [
              "03",
              "Make every moment count",
              "Goals, assists and clean sheets turn into points. Follow the results and climb the table.",
            ],
          ].map(([n, title, copy]) => (
            <article key={n}>
              <span className="step">{n} ↗</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="cta">
        <div>
          <p className="eyebrow">THE TOUCHLINE IS CALLING</p>
          <h2>
            Big opinions?
            <br />
            Build a squad to match.
          </h2>
        </div>
        <Link className="button light" to="/register">
          Get in the game ↗
        </Link>
      </section>
    </>
  );
}
