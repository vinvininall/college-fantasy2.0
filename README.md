# SFL Fantasy

A working MERN fantasy football application for independent college tournaments. The included Campus Cups, college, teams and players are **fictional demonstration data**, not actual SFL records.

React/Vite provides the interface. Express is the API. Mongoose stores seven related models in MongoDB. The server owns all budgets, permissions, squad eligibility and scoring calculations.

## Quick start

Install Node.js **24 LTS** (22.12+ also works) and MongoDB Community Server 8, or use an Atlas cluster. Run commands from this repository's root:

```sh
npm ci
cp .env.example .env
```

Set `MONGODB_URI` and replace `JWT_SECRET` with at least 32 random characters. Generate a secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

For a normal local MongoDB installation, start the MongoDB service and use `mongodb://127.0.0.1:27017/sfl_fantasy`. Alternatively start an isolated local server:

```sh
mkdir -p work/mongo-dev
mongod --dbpath ./work/mongo-dev --port 27117 --bind_ip 127.0.0.1
```

Use `mongodb://127.0.0.1:27117/sfl_fantasy` for this alternative. Keep MongoDB running in its terminal.

```sh
npm run seed
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173`. The API runs at `http://127.0.0.1:4000`. Vite forwards `/api` to the API, so no development API URL is needed. If Vite selects another port, add that exact origin to `CLIENT_ORIGIN`. The server requires a restart after backend edits; Vite reloads frontend edits automatically.

A local `.env` was generated during implementation with a random JWT secret and the isolated MongoDB URI on port 27117. It is ignored by Git and excluded from the downloadable source archive. Do not overwrite a configured `.env` merely to run the examples.

## First administrator

There is no public admin-grant endpoint and no built-in administrator password. Set these variables in your private environment or local `.env`:

```dotenv
ADMIN_NAME=Your chosen display name
ADMIN_EMAIL=your-chosen-address@example.com
ADMIN_PASSWORD=your-own-strong-unique-password
```

Run `npm run admin`, then remove `ADMIN_PASSWORD` from the environment. Passwords must be at least 7 characters and at most 72 UTF-8 bytes; any characters are allowed. The script **refuses any existing email**, including an existing ordinary account; it never promotes arbitrary accounts. Sign in through the normal login page. Use a new dedicated account if an email is already registered.

The demo seed's disabled organizer account cannot sign in and has no administrative privileges.

## What you can do

- Register, sign in, restore an eight-hour JWT session and log out.
- Browse tournaments, rules, teams, searchable/filterable players, fixtures and player statistics.
- Configure independent 5v5, 6v6, 7v7, 9v9 and 11v11 tournaments, budgets, formations and scoring.
- Save an incomplete squad, select starters, assign captain and vice-captain, and complete the squad.
- Manage teams, prices, player positions, fixtures, results and match events as an administrator.
- Import up to 100 teams and 1,000 players per tournament using a validated JSON roster.
- Correct events and immediately see recalculated fantasy points and finalized match scores.
- View shared leaderboard ranks, personal performance and individual point breakdowns.
- Use the responsive interface on desktop, tablet and mobile, with keyboard focus styles and labeled forms.

## Architecture and project structure

```text
client/
  index.html
  src/
    main.jsx                 React entry point
    App.jsx                  Navigation, routes and session restoration
    session.jsx              Authentication context
    api.js                   JSON API client and display formatting
    components.jsx           Shared controls, loading, errors and route guards
    style.css                Responsive football-inspired visual system
    pages/
      Landing.jsx            Public home page
      Auth.jsx               Registration and login
      Tournaments.jsx        Tournament, team, player, fixture and leaderboard views
      Squad.jsx              Player selection, pitch, lineup and squad saving
      Dashboard.jsx          Personal squads and point breakdowns
      Admin.jsx              Tournament editor, registry and fixture scheduling
      Match.jsx              Match timeline, results and event correction
    flows.test.jsx           React Testing Library interaction tests
server/
  index.js                   Environment checks, MongoDB connection and HTTP startup
  app.js                     Express security middleware, routes and safe errors
  models/index.js            Seven Mongoose models and database indexes
  middleware/
    auth.js                  JWT verification and server-side role checks
    mutations.js             Single-process mutation queue
  routes/
    auth.js
    tournaments.js
    roster.js
    squads.js
    matches.js
    events.js
    performance.js
  services/
    rules.js                 Input schemas, formation and budget validation
    resources.js             IDs, visibility, pagination and roster locks
    scoring.js               Centralized pure scoring and database aggregation
    matchScores.js           Goals/own goals and corrected finalized scoreboards
  scripts/
    admin.js                 Explicit administrator bootstrap
    seed.js                  Idempotent fictional demo data
  tests/application.test.js  Real MongoDB + Supertest integration and scoring tests
.github/workflows/ci.yml      Automated tests/build using MongoDB 8
.env.example
render.yaml                  API deployment blueprint; one Node process
vercel.json                  Static frontend build and nested-route fallback
vite.config.js
vitest.config.js
package.json
package-lock.json            Reproducible dependency resolution
```

Routes contain short controller functions grouped by domain. Shared business rules live in services, rather than being repeated in React. `app.js` can be imported by tests without opening an HTTP port. `index.js` starts the actual server only after MongoDB connects and unique indexes are ready.

### Model relationships

| Model        | Purpose and references                                                                      |
| ------------ | ------------------------------------------------------------------------------------------- |
| User         | Name, normalized unique email, hidden password hash and role                                |
| Tournament   | Rules, lifecycle, registration switch and creator → User                                    |
| Team         | Real team → Tournament; unique name and short name within that tournament                   |
| Player       | Real player → Team; position, independent integer auction/fantasy prices                    |
| FantasySquad | User + Tournament, unique pair; selected players, starters and captain references           |
| Match        | Tournament + two Team references, kickoff, venue, status and entered scores                 |
| MatchEvent   | Match + Player + recording administrator; type, minute and optional assisted-goal reference |

A player's tournament is derived through their team, avoiding a second tournament field that could disagree. A real team is separate from a user's fantasy squad. No authoritative fantasy point totals or goal counters are stored on Player.

## Rules and lifecycle

`fantasy squad size = starting players + substitutes`. Starting players and squad size must be positive integers; substitutes may be zero. Prices and budgets are integer rupees. The format determines real-world players per side, independently from the fantasy squad size.

A configured formation contains `name`, `GK`, `DEF`, `MID`, `FWD`. Its counts must total the starting lineup size. Alternatively an administrator must explicitly choose the `unrestricted` position policy. The editor preserves custom settings when a format changes; **Apply suggested defaults** is an explicit replacement action.

Lifecycle progresses in one direction:

| Status    | Allowed behavior                                                               |
| --------- | ------------------------------------------------------------------------------ |
| draft     | Admin configuration and roster/fixture preparation; hidden from ordinary users |
| upcoming  | Public browsing and squad saving when registration is enabled                  |
| active    | Squads and rosters locked; live/final results and event recording/correction   |
| completed | Historical read-only competition; no more event or result changes              |

- Rules freeze when the first squad **or fixture** exists. Names, descriptions and the registration switch can still be edited before completion.
- Rosters freeze when any squad exists or the tournament starts. This intentionally prevents later price/position changes from changing a saved squad's cost or historical points.
- Squads lock at the first noncancelled fixture kickoff even if the organizer has not yet marked the tournament active.
- Complete or cancel all outstanding fixtures before completing the tournament. Complete a tournament only after all event corrections are finished.
- Scheduled fixtures without events can be edited. Cancellation preserves the fixture and is irreversible. Cancelled matches cannot accept events and never contribute points.
- Teams with players/fixtures and players referenced by squads/events cannot be deleted. Tournaments, matches and users have no destructive deletion endpoints. A completed tournament serves as the historical archive.

### Squad saving

One `PUT` atomically replaces the authenticated user's squad document. It supports initial creation, player additions/removals, lineup changes, captain changes and incomplete saves, avoiding several overlapping mutation endpoints.

The API rejects client-supplied ownership, prices and budget totals. It reads selected players and prices from MongoDB:

```text
spent = sum(selected players' fantasyPrice)
remaining = tournament.budget - spent
```

Partial saves must still fit the budget and squad cap and use valid distinct tournament players. Completion additionally requires the full squad, exact starter count, a permitted formation, and two different selected captain references. Captains may be bench players, but bench players score zero.

Every update must include the last returned `__v` as `version`. A stale version returns HTTP 409; reload and reapply your changes. Even an unchanged save advances the revision. Unique indexes prevent duplicate user/tournament squads.

### Authentication and authorization

Passwords are hashed with bcrypt cost 12. The hash is excluded from normal database queries and never returned. Public registration strictly rejects `role` and unexpected fields. Login errors do not reveal whether an account exists. JWTs use HS256, a verified issuer and an eight-hour expiration; the user's current role is loaded from MongoDB on every authenticated request.

The frontend stores the JWT in localStorage and restores the user using `/auth/me`. Protected pages wait for restoration. HTTP 401 clears the session. Logout removes the local token. **localStorage is accessible to JavaScript and is vulnerable to token theft through XSS; it does not have HttpOnly-cookie protection.** Logout does not revoke a copied JWT before expiry. A production hardening option is HttpOnly/Secure/SameSite cookies with CSRF protections and token revocation.

Every official-data mutation uses authentication plus an admin role check on the server. Every squad mutation derives its owner from the verified JWT. Hiding admin navigation is only a convenience, not a security boundary.

The API validates ObjectIds, request schemas, numeric ranges, enum values and cross-resource relationships. Queries are built from validated scalar values; search text is escaped before becoming a regex. Helmet, bounded JSON bodies, explicit CORS origins and a 100-attempt/15-minute/IP authentication limit provide basic protection. Behind Render's trusted reverse proxy, production uses exactly one trusted proxy hop. Do not expose this configuration directly behind an untrusted proxy chain.

### Standalone MongoDB and concurrency

This deployment uses **one Node process / one backend instance**. The mutation queue runs each write controller to completion before the next write, including when a client disconnects. That keeps lifecycle checks, price locks, reference checks and deletions coherent without requiring transactions, which standalone MongoDB does not support. Squad saves also use Mongoose optimistic concurrency and database uniqueness constraints.

Do not run Node cluster/PM2 workers, multiple Render instances, or separate application writers against the same database. Bootstrap and seed are maintenance commands, not concurrent live operations. For horizontal scaling, migrate cross-document checks to replica-set transactions or a database-backed locking strategy first. Reads can see successive single-document changes; the implementation deliberately avoids multi-document squad writes and cascading deletions.

## Events, scores and leaderboards

The initial default points are configurable per tournament:

| Contribution                      |         Points |
| --------------------------------- | -------------: |
| Goal: GK / DEF / MID / FWD        | 10 / 7 / 6 / 5 |
| Assist                            |              3 |
| Clean-sheet credit                |              4 |
| Penalty save                      |              5 |
| Goalkeeper save / shot on target  |          1 / 1 |
| Penalty missed                    |             -2 |
| Player of the match               |              5 |
| Yellow / red card                 |        -1 / -3 |
| Own goal                          |             -2 |
| Captain / vice-captain multiplier |        2 / 1.5 |

Only completed matches count on official leaderboards. Admins control when a match is marked live.

`scoreEvents()` aggregates each player's contributions using their locked position and the tournament's scoring rules. `scoreSquad()` includes only starters and applies exactly one multiplier per player. Half and quarter points are exactly representable with these configured half-step values. Leaderboards use descending points, deterministic user-ID ordering within ties, and competition ranks such as `1, 1, 3`. Incomplete squads are excluded.

Points are calculated on demand using batched database reads; no client-submitted score is accepted and no persisted counter is incremented. Correcting or deleting an event therefore immediately changes the next leaderboard calculation without double awarding points. Player performance includes finalized events and match-by-match points.

Goals credit the scorer's team; own goals credit its opponent. Before a match can be finalized, its entered score must equal its recorded goal/own-goal tally. After event corrections, finalized match endpoints derive the scoreboard again from events. Stored Match scores retain the last entered result; **the read API's derived finalized score is authoritative after corrections**. This avoids a cross-document scoreboard-cache update on standalone MongoDB.

Assists reference one recorded goal, at the same minute, by a different player on the same team. Only one assist is credited per goal. Remove its assist before editing/deleting that goal. Identical player/type/minute events are rejected in both the API and a unique index. Clean-sheet credits are explicit admin events, restricted to GK/DEF, once per match/player, and cannot conflict with conceded goal events. Penalty saves and goalkeeper saves require GK. Shot-on-target, missed-penalty, and player-of-the-match awards are also configurable scoring events; only one player-of-the-match award is allowed per match.

Admins can record, correct, and remove events while a match is live. Match centres poll for score, event, and provisional fantasy-team-point updates every five seconds without a manual refresh. Live points are clearly provisional and do not enter official standings; completing a match recalculates and includes its points in tournament standings.

Actual substitutions, minutes played, automatic clean-sheet duration qualification, penalty conversion events, transfer windows, per-match lineup changes and automatic bench substitutions are **not implemented**. Administrators must verify participation/clean-sheet eligibility themselves. The same frozen fantasy lineup scores throughout a tournament. Two distinct same-type contributions by one player in the same integer minute require correcting the time representation before entry; second-level event timing is a future improvement.

## REST API

All paths begin with `/api`. Success: `{ "data": ... }`. Failure: `{ "error": { "message": "..." } }`. HTTP 400 is invalid input, 401 invalid/missing session, 403 forbidden, 404 missing resource, 409 uniqueness/lifecycle/stale-version conflict, 429 rate limit and 500 unexpected server failure. Health returns 503 when MongoDB is unavailable. Error responses never contain stack traces.

List endpoints accept `page` (default 1) and `limit` (default 50, maximum 100), except `/my-squads`, which returns the current user's collection. Public fixture and player browsers and the leaderboard have paging controls. Team/player selectors, administration registries and match timelines collect all pages in batches of 100, without silently truncating records.

| Method           | Path                                                       | Access                                |
| ---------------- | ---------------------------------------------------------- | ------------------------------------- |
| GET              | `/health`                                                  | Public                                |
| POST             | `/auth/register`, `/auth/login`                            | Public, rate limited                  |
| GET              | `/auth/me`                                                 | Signed in                             |
| GET              | `/tournaments`                                             | Public, no drafts                     |
| GET              | `/admin/tournaments`                                       | Admin, including drafts               |
| POST             | `/tournaments`                                             | Admin                                 |
| GET, PUT         | `/tournaments/:tournamentId`                               | Read public/admin drafts; write admin |
| PATCH            | `/tournaments/:tournamentId/status`                        | Admin                                 |
| GET, POST        | `/tournaments/:tournamentId/teams`                         | Read public/admin drafts; write admin |
| GET, PUT, DELETE | `/teams/:teamId`                                           | Read public/admin drafts; write admin |
| GET, POST        | `/teams/:teamId/players`                                   | Read public/admin drafts; write admin |
| GET              | `/tournaments/:tournamentId/players`                       | Filters: `search`, `team`, `position` |
| GET, PUT, DELETE | `/players/:playerId`                                       | Read public/admin drafts; write admin |
| GET, PUT         | `/tournaments/:tournamentId/my-squad`                      | Signed in; current owner only         |
| GET              | `/my-squads`                                               | Signed in; current owner only         |
| GET              | `/tournaments/:tournamentId/participation`                 | Admin                                 |
| GET, POST        | `/tournaments/:tournamentId/matches`                       | Read public/admin drafts; write admin |
| GET, PUT         | `/matches/:matchId`                                        | Read public/admin drafts; write admin |
| PUT              | `/matches/:matchId/result`                                 | Admin                                 |
| GET, POST        | `/matches/:matchId/events`                                 | Read public/admin drafts; write admin |
| PUT, DELETE      | `/match-events/:eventId`                                   | Admin                                 |
| GET              | `/matches/:matchId/live-performance`                       | Public live provisional/final points  |
| GET              | `/tournaments/:tournamentId/leaderboard`                   | Public/admin drafts                   |
| GET              | `/tournaments/:tournamentId/my-performance`                | Current signed-in user                |
| GET              | `/tournaments/:tournamentId/players/:playerId/performance` | Public/admin drafts                   |

Example partial squad request (use real IDs from your database):

```http
PUT /api/tournaments/TOURNAMENT_ID/my-squad
Authorization: Bearer YOUR_JWT
Content-Type: application/json

{
  "players": ["PLAYER_ID"],
  "starters": [],
  "captain": null,
  "viceCaptain": null,
  "complete": false
}
```

Omit `version` only for initial creation. Subsequent saves include `"version": 0` (or the latest returned revision). The API returns authoritative spent/remaining amounts alongside the saved squad. A GET for an uncreated squad or ineligible personal performance returns `data: null`.

## Fictional seed

`npm run seed` creates two independent upcoming tournaments (7v7/₹1.5 crore and 6v6/₹2 crore), eight teams and 96 fictional players. It uses stable demo keys, `$setOnInsert` and unique indexes. Running it again neither duplicates records nor modifies/deletes existing data. It creates no playable accounts and grants no admin privileges. Seed only a development/demo database.

## Tests and build

```sh
npm test
npm run build
npm run check
npm audit
```

Tests use Vitest, Supertest, React Testing Library and jsdom. Backend tests start a temporary local `mongod` on a random loopback port with a unique temporary `_test` database, then stop it and remove only the test-created directory. MongoDB must be installed and `mongod` must be on PATH. Alternatively, explicitly provide `TEST_MONGODB_URI` pointing to a **disposable** database whose name ends with `_test`. Tests clear collections in that test database; never configure production data here. Normal `.env` application data is not used by the suite.

The CI workflow supplies MongoDB 8 as a separate service. Tests cover auth/hash/roles/JWTs, all formats and invalid rules, team uniqueness, invalid prices/relationships, ownership, budgets, formations, complete/partial squads, stale updates, lifecycle/roster locks, fixture/event validation, captain/vice/bench scoring, tied rankings, own-goal scoreboards, clean-sheet conflicts and event corrections. A complete HTTP workflow logs in an admin, registers/logs in a normal user, creates the tournament/roster, saves a squad, finalizes a match and verifies corrected points/ranks. Frontend tests simulate forms, browsing, selection, budget display, lineup/captain saving, fixtures, leaderboard and admin visibility; their API is mocked, while backend tests use real MongoDB.

Latest verified local run: **56 tests passed (46 backend/scoring/maintenance and 10 frontend); production Vite build passed; dependency audit: zero vulnerabilities.** Browser smoke checks verified landing, tournament browsing and the real player pool, including a 390px mobile overflow check. Production hosting and third-party account integrations have not been tested or deployed.

## Environment variables

| Variable                                      | Where          | Meaning                                                              |
| --------------------------------------------- | -------------- | -------------------------------------------------------------------- |
| `MONGODB_URI`                                 | Server/scripts | Local/Atlas URI; required                                            |
| `JWT_SECRET`                                  | Server         | At least 32 random characters; required                              |
| `PORT`                                        | Server         | Listening port, defaults to 4000                                     |
| `CLIENT_ORIGIN`                               | Server         | Comma-separated allowed frontend origins; required in production     |
| `NODE_ENV`                                    | Server         | Set `production` on Render                                           |
| `VITE_API_URL`                                | Frontend build | API origin, e.g. `https://your-api.onrender.com`; no trailing `/api` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Bootstrap only | Explicit new administrator configuration                             |
| `TEST_MONGODB_URI`                            | Tests only     | Optional disposable database ending in `_test`                       |

Only variables prefixed `VITE_` are compiled into the browser. Never prefix database credentials, JWT secrets or admin credentials with `VITE_`. The local frontend uses an empty API URL and the Vite proxy. The production frontend needs its API origin at **build time**.

## Deployment: Atlas + Render + Vercel

No deployment has been performed. External accounts, repository hosting and production credentials must be provided manually.

### MongoDB Atlas

1. Create/select a MongoDB Atlas project and cluster.
2. Under Database Access create a dedicated database user with `readWrite` for only the application's database, using a strong unique password.
3. Under Network Access allow your development IP for setup and the backend provider's documented outbound IP ranges or a private networking connection. Unrestricted `0.0.0.0/0` is not required and should not be the default.
4. Copy the Drivers connection string. URL-encode special password characters and set a database name, for example `mongodb+srv://USER:PASSWORD@CLUSTER/sfl_fantasy?retryWrites=true&w=majority`.
5. Set `MONGODB_URI` in the backend environment. Keep it out of Git and the frontend.
6. Start the API, confirm `/api/health` returns `{ "data": { "status": "ok" } }`, and check that model indexes were created. TLS is part of the Atlas SRV connection.

### Render API

1. Push the repository to a Git host and connect it to Render. Use `render.yaml` as a Blueprint or create a Node web service manually.
2. Use Node 24 LTS. Root directory: repository root. Build: `npm ci --omit=dev`. Start: `npm start`. Health path: `/api/health`.
3. Keep exactly **one instance**, with no Node cluster workers. The provided Blueprint uses one instance.
4. Configure `MONGODB_URI`, generated `JWT_SECRET`, `NODE_ENV=production`, and `CLIENT_ORIGIN=https://YOUR-FRONTEND.vercel.app` (exact origin, no trailing slash). Render provides `PORT`.
5. Add Render's outbound network ranges to Atlas's allowlist. Deploy and check `/api/health`.
6. Run the administrator bootstrap against that database from a trusted terminal/Render shell using explicit environment variables, then remove bootstrap passwords. Do not run demo seeds against real competition data.

### Vercel frontend

1. Import the same repository. Framework: Vite. Root: repository root. Install: `npm ci`. Build: `npm run build`. Output: `dist`.
2. Configure `VITE_API_URL=https://YOUR-API.onrender.com`. Never add backend secrets to frontend variables.
3. Deploy. `vercel.json` sends nested browser routes to `index.html`, preserving assets. Refresh `/tournaments` and `/dashboard` to verify routing.
4. Confirm Render's `CLIENT_ORIGIN` matches the final frontend origin. Preview deployment origins must be explicitly allowed if needed; the API does not accept arbitrary Vercel subdomains.
5. Register a test user, sign in as your separately bootstrapped admin, and run the workflow below on a clearly marked verification tournament.

### Release checklist

- [ ] Tests/build/audit pass with the committed lockfile.
- [ ] Atlas user and IP/private-network rules configured.
- [ ] Backend secrets and frontend API URL set in the correct services.
- [ ] One backend instance, trusted reverse proxy and health check verified.
- [ ] Administrator bootstrapped without hardcoded credentials.
- [ ] No secrets or real personal data committed.
- [ ] Registration/login/restore/logout verified over HTTPS.
- [ ] Two differently configured tournaments remain isolated.
- [ ] Illegal budgets, squad changes and normal-user admin writes rejected.
- [ ] Squad completed before activation; match goals/assists/results recorded.
- [ ] Corrected fantasy score and leaderboard match expected values.
- [ ] Direct nested-page refresh works on the deployed frontend.
- [ ] Database backups and restore procedure established before real play.

## Known limitations and next steps

This is a single-process student-scale application. Leaderboards calculate on demand and load all eligible squads for ranking; introduce cached materialized results with deliberate invalidation for large competitions. Administration selectors and registries collect all database pages; add virtualized/searchable selectors for unusually large competitions to reduce browser memory use. Public tournament/player/fixture/leaderboard browsing is paginated.

There are no email verification, password reset, refresh tokens, per-device revocation, real-time feeds, media uploads, payment/prize features or live match-provider integrations. Optional logo/photo URLs are stored but the core interface uses consistent team/player graphics. The application does not promise real SFL data. Fonts are loaded from Google Fonts with local fallbacks; self-host them for offline use or stricter privacy requirements.

Lifecycle and roster locking are intentionally conservative to protect historical scoring. Correct events while the tournament is active; completed tournaments cannot be reopened through the API. A future version can add audited reopening and per-match lineup snapshots before adding transfers or rolling lock deadlines.
