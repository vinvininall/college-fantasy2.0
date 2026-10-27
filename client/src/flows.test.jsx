// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  act,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { App } from "./App";
import { Session } from "./session";
import { AuthPage } from "./pages/Auth";
import { PlayerBrowser, Leaderboard } from "./pages/Tournaments";
import { SquadBuilder } from "./pages/Squad";
import { RosterAdmin } from "./pages/Admin";
import { PlayerPage } from "./pages/Tournaments";
import { MatchPage } from "./pages/Match";
import { MyPerformance } from "./pages/Dashboard";
import { Async, useLoad } from "./components";
import { api, rupees } from "./api";
vi.mock("./api", async () => {
  const actual = await vi.importActual("./api");
  return { ...actual, api: vi.fn() };
});
const t = {
  _id: "t1",
  name: "Campus Cup",
  college: "Fictional College",
  status: "upcoming",
  format: "5v5",
  description: "Demo",
  budget: 1000,
  squadSize: 2,
  startingPlayers: 1,
  substitutes: 1,
  formationPolicy: "unrestricted",
  formations: [],
  scoring: {
    goal: { GK: 10, DEF: 7, MID: 6, FWD: 5 },
    captain: 2,
    viceCaptain: 1.5,
  },
};
const p = {
  _id: "p1",
  name: "Aarav Demo",
  team: { _id: "tm1", name: "Falcons" },
  position: "FWD",
  fantasyPrice: 100,
  jerseyNumber: 10,
};
const stored = new Map();
const storage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: (key) => stored.delete(key),
  clear: () => stored.clear(),
};
Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  configurable: true,
});
beforeEach(() => {
  api.mockReset();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});
afterEach(cleanup);
it("toggles and remembers the selected color theme", async () => {
  api.mockResolvedValue([]);
  const user = userEvent.setup();
  render(<App />);
  const toggle = screen.getByRole("button", { name: "Switch to dark mode" });
  await user.click(toggle);
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("sfl-theme")).toBe("dark");
  await user.click(
    screen.getByRole("button", { name: "Switch to light mode" }),
  );
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem("sfl-theme")).toBe("light");
});
it("submits a JSON roster import and reports created records", async () => {
  api.mockImplementation((path) =>
    path.includes("/roster/import")
      ? Promise.resolve({ teams: 1, players: 1 })
      : Promise.resolve([]),
  );
  const user = userEvent.setup();
  render(<RosterAdmin tournament="t1" />);
  const roster = {
    teams: [
      {
        name: "Falcons",
        shortName: "FAL",
        players: [
          {
            name: "Aarav Sharma",
            position: "FWD",
            auctionPrice: 500,
            fantasyPrice: 120,
          },
        ],
      },
    ],
  };
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Roster JSON" }),
    {
      target: { value: JSON.stringify(roster) },
    },
  );
  await user.click(screen.getByRole("button", { name: "Import roster" }));
  expect(api).toHaveBeenCalledWith("/tournaments/t1/roster/import", {
    method: "POST",
    body: roster,
  });
  expect((await screen.findByRole("status")).textContent).toContain(
    "Imported 1 team and 1 player.",
  );
});
it("returns to the originating screen when a deleted player can no longer be loaded", async () => {
  api.mockRejectedValue(new Error("Resource not found"));
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/origin"]}>
      <Routes>
        <Route
          path="/origin"
          element={
            <Link to="/players/removed" state={{ returnTo: "/origin" }}>
              Original player list
            </Link>
          }
        />
        <Route path="/players/:id" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await user.click(screen.getByText("Original player list"));
  expect(await screen.findByText("Original player list")).toBeTruthy();
  expect(api).toHaveBeenCalledWith("/players/removed");
});
it("labels live match fantasy points as provisional", async () => {
  api.mockImplementation((path) =>
    Promise.resolve(
      path === "/matches/m1"
        ? {
            _id: "m1",
            tournament: "t1",
            homeTeam: { name: "Falcons", shortName: "FAL" },
            awayTeam: { name: "Wolves", shortName: "WOL" },
            homeScore: 2,
            awayScore: 1,
            scheduledAt: "2026-10-27T10:00:00Z",
            status: "live",
          }
        : path.includes("/live-performance")
          ? {
              status: "live",
              provisional: true,
              rows: [
                {
                  user: "u1",
                  name: "Aarav",
                  rank: 1,
                  points: 12,
                  details: [],
                },
              ],
            }
          : [],
    ),
  );
  render(
    <Session.Provider value={{ user: null }}>
      <MemoryRouter initialEntries={["/matches/m1"]}>
        <Routes>
          <Route path="/matches/:id" element={<MatchPage />} />
        </Routes>
      </MemoryRouter>
    </Session.Provider>,
  );
  expect(
    await screen.findByText("Provisional fantasy-team points"),
  ).toBeTruthy();
  expect(screen.getByText("Aarav")).toBeTruthy();
  expect(screen.getByText("12")).toBeTruthy();
  await waitFor(() => {
    expect(screen.getByText("2 : 1")).toBeTruthy();
    expect(screen.getByText("Falcons")).toBeTruthy();
    expect(screen.getByText("Wolves")).toBeTruthy();
  });
  expect(
    api.mock.calls.filter(([path]) => path === "/matches/m1"),
  ).toHaveLength(1);
});
it("keeps loaded match data visible while an event refresh is in progress", async () => {
  let finishRefresh;
  api
    .mockResolvedValueOnce({ status: "live", score: "1 : 0" })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
  function RefreshProbe() {
    const load = useLoad("/matches/m1");
    return (
      <>
        <Async load={load}>{(match) => <p>{match.score}</p>}</Async>
        <button onClick={load.reload}>Record event</button>
      </>
    );
  }
  const user = userEvent.setup();
  render(<RefreshProbe />);
  expect(await screen.findByText("1 : 0")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Record event" }));
  expect(screen.getByText("1 : 0")).toBeTruthy();
  expect(screen.queryByText("Loading the field…")).toBeNull();
  finishRefresh({ status: "live", score: "2 : 0" });
  expect(await screen.findByText("2 : 0")).toBeTruthy();
});
it("does not let an older provisional-points request overwrite a newer event refresh", async () => {
  let finishOldRequest;
  api
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldRequest = resolve;
        }),
    )
    .mockResolvedValueOnce({ points: 15 });
  function PointsProbe() {
    const load = useLoad("/matches/m1/live-performance", { pollMs: 5000 });
    return (
      <>
        <Async load={load}>{(result) => <p>{result.points}</p>}</Async>
        <button onClick={load.reload}>Refresh after event</button>
      </>
    );
  }
  const user = userEvent.setup();
  render(<PointsProbe />);
  await user.click(
    await screen.findByRole("button", { name: "Refresh after event" }),
  );
  expect(await screen.findByText("15")).toBeTruthy();
  finishOldRequest({ points: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getByText("15")).toBeTruthy();
});
it("submits registration and rejects mismatched confirmation", async () => {
  const login = vi.fn();
  api.mockResolvedValue({ user: { name: "Aarav" }, token: "token" });
  const user = userEvent.setup();
  render(
    <Session.Provider value={{ login }}>
      <MemoryRouter>
        <AuthPage register />
      </MemoryRouter>
    </Session.Provider>,
  );
  await user.type(screen.getByLabelText("Your name"), "Aarav");
  await user.type(screen.getByLabelText("Email address"), "aarav@example.test");
  await user.type(screen.getByLabelText("Password"), "!!!!!!!");
  await user.type(screen.getByLabelText("Confirm password"), "not-same");
  await user.click(screen.getByRole("button", { name: /Create account/ }));
  expect(screen.getByRole("alert").textContent).toContain(
    "Passwords do not match",
  );
  await user.clear(screen.getByLabelText("Confirm password"));
  await user.type(screen.getByLabelText("Confirm password"), "!!!!!!!");
  await user.click(screen.getByRole("button", { name: /Create account/ }));
  expect(api).toHaveBeenCalledWith(
    "/auth/register",
    expect.objectContaining({
      body: {
        name: "Aarav",
        email: "aarav@example.test",
        password: "!!!!!!!",
      },
    }),
  );
  expect(login).toHaveBeenCalled();
});
it("login shows server validation errors and re-enables submit", async () => {
  api.mockRejectedValue(new Error("Invalid email or password"));
  const user = userEvent.setup();
  render(
    <Session.Provider value={{ login: vi.fn() }}>
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    </Session.Provider>,
  );
  await user.type(
    screen.getByLabelText("Email address"),
    "manager@example.test",
  );
  await user.type(screen.getByLabelText("Password"), "wrong-password");
  await user.click(screen.getByRole("button", { name: "Sign in ↗" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Invalid email or password",
  );
  expect(screen.getByRole("button", { name: "Sign in ↗" }).disabled).toBe(
    false,
  );
});
it("browses real API tournaments with links", async () => {
  window.history.replaceState({}, "", "/tournaments");
  api.mockResolvedValue([t]);
  render(<App />);
  expect(await screen.findByText("Campus Cup")).toBeTruthy();
  expect(screen.getByText("Campus Cup").closest("a").getAttribute("href")).toBe(
    "/tournaments/t1",
  );
});
it("player browser filters and adds or removes players", async () => {
  api.mockImplementation((path) =>
    Promise.resolve(path.includes("/teams") ? [p.team] : [p]),
  );
  const toggle = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter>
      <PlayerBrowser tournament="t1" onToggle={toggle} />
    </MemoryRouter>,
  );
  await user.click(
    await screen.findByRole("button", { name: "Add Aarav Demo" }),
  );
  expect(toggle).toHaveBeenCalledWith(p);
  await user.selectOptions(screen.getByLabelText("Position"), "FWD");
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(expect.stringContaining("position=FWD")),
  );
  view.rerender(
    <MemoryRouter>
      <PlayerBrowser tournament="t1" selected={["p1"]} onToggle={toggle} />
    </MemoryRouter>,
  );
  await user.click(
    await screen.findByRole("button", { name: "Remove Aarav Demo" }),
  );
  expect(toggle).toHaveBeenCalledTimes(2);
});
it("squad builder adds, updates budget, chooses lineup/captains and saves through API", async () => {
  const p2 = {
    ...p,
    _id: "p2",
    name: "Kabir Demo",
    position: "GK",
    fantasyPrice: 200,
  };
  api.mockImplementation((path, opts) => {
    if (opts) return Promise.resolve({ _id: "s1", __v: 0, ...opts.body });
    if (path.endsWith("/my-squad")) return Promise.resolve(null);
    if (path === "/tournaments/t1") return Promise.resolve(t);
    if (path.includes("/teams")) return Promise.resolve([p.team]);
    if (path.includes("/players")) return Promise.resolve([p, p2]);
    throw Error(path);
  });
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/tournaments/t1/squad"]}>
      <Routes>
        <Route path="/tournaments/:id/squad" element={<SquadBuilder />} />
      </Routes>
    </MemoryRouter>,
  );
  await user.click(
    await screen.findByRole("button", { name: "Add Aarav Demo" }),
  );
  await user.click(screen.getByRole("button", { name: "Add Kabir Demo" }));
  expect(screen.getByText(rupees(700))).toBeTruthy();
  await user.click(screen.getAllByRole("checkbox", { name: "Starter" })[0]);
  await user.selectOptions(screen.getByLabelText("Captain"), "p1");
  await user.selectOptions(screen.getByLabelText("Vice-captain"), "p2");
  await user.click(screen.getByRole("button", { name: "Complete my squad ↗" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/tournaments/t1/my-squad",
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({
          players: ["p1", "p2"],
          starters: ["p1"],
          captain: "p1",
          viceCaptain: "p2",
          complete: true,
        }),
      }),
    ),
  );
  expect(await screen.findByText(/Your squad is complete/)).toBeTruthy();
});
it("leaderboard displays final points and shared ranks", async () => {
  api.mockResolvedValue([
    { user: "u1", name: "Aarav", points: 14.5, rank: 1, matchesCounted: 2 },
    { user: "u2", name: "Kabir", points: 14.5, rank: 1, matchesCounted: 2 },
  ]);
  render(
    <MemoryRouter>
      <Leaderboard tournament="t1" />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Aarav")).toBeTruthy();
  expect(screen.getAllByText("14.5")).toHaveLength(2);
});
it("refreshes provisional manager scores while a match is live", async () => {
  let leaderboardRequests = 0;
  api.mockImplementation((path) => {
    if (path.endsWith("/squad-disclosure"))
      return Promise.resolve({ allowed: false });
    if (path.includes("/leaderboard")) {
      leaderboardRequests++;
      return Promise.resolve([
        {
          user: "u1",
          name: "Aarav",
          points: leaderboardRequests === 1 ? 10 : 18,
          rank: 1,
          matchesCounted: 1,
          liveMatchesCounted: 1,
          provisional: true,
        },
      ]);
    }
    return Promise.resolve([]);
  });
  vi.useFakeTimers();
  try {
    render(
      <MemoryRouter>
        <Leaderboard tournament="t1" />
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("10")).toBeTruthy();
    expect(
      screen.getByText(/Provisional — includes live matches/),
    ).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText("18")).toBeTruthy();
    expect(leaderboardRequests).toBeGreaterThanOrEqual(2);
  } finally {
    vi.useRealTimers();
  }
});
it("shows a manager's live points as provisional in their personal points view", async () => {
  api.mockResolvedValue({
    points: 18,
    finalizedPoints: 10,
    livePoints: 8,
    provisional: true,
    liveMatchesCounted: 1,
    matchesCounted: 2,
    rank: 1,
    details: [
      {
        player: "p1",
        name: "Aarav Demo",
        base: 9,
        multiplier: 2,
        points: 18,
        role: "captain",
      },
    ],
  });
  render(<MyPerformance tournament="t1" />);
  expect(await screen.findByText("Total points (includes live)")).toBeTruthy();
  expect(screen.getAllByText("18")).toHaveLength(2);
  expect(
    screen.getByText(/Includes 8 provisional points from 1 live match/),
  ).toBeTruthy();
  expect(screen.getByText("2 finalized + 1 live")).toBeTruthy();
  expect(screen.getByText("Aarav Demo")).toBeTruthy();
  expect(api).toHaveBeenCalledWith("/tournaments/t1/my-performance");
});
it("searches managers and displays a disclosed squad with roles and points", async () => {
  api.mockImplementation((path) =>
    Promise.resolve(
      path === "/tournaments/t1/squad-disclosure"
        ? { allowed: true }
        : path.includes("/managers/u1/squad")
          ? {
              user: "u1",
              name: "Aarav",
              points: 15,
              details: [
                {
                  player: "p1",
                  name: "Aarav Demo",
                  position: "FWD",
                  role: "captain",
                  points: 10,
                },
                {
                  player: "p2",
                  name: "Kabir Demo",
                  position: "GK",
                  role: "bench",
                  points: 0,
                },
                {
                  player: "p3",
                  name: "Mira Demo",
                  position: "MID",
                  role: "vice-captain",
                  points: 5,
                },
              ],
            }
          : [
              {
                user: "u1",
                name: "Aarav",
                points: 15,
                rank: 1,
                matchesCounted: 1,
              },
            ],
    ),
  );
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Leaderboard tournament="t1" />
    </MemoryRouter>,
  );
  await user.type(screen.getByLabelText("Search managers by name"), "Aar");
  await user.click(await screen.findByRole("button", { name: "Aarav" }));
  expect(await screen.findByText("Aarav Demo")).toBeTruthy();
  expect(screen.getByText("Captain")).toBeTruthy();
  expect(screen.getByText("Vice-captain")).toBeTruthy();
  expect(screen.getByText("Bench")).toBeTruthy();
  expect(api).toHaveBeenCalledWith(
    expect.stringContaining("/leaderboard?page=1&limit=50&name=Aar"),
  );
  expect(api).toHaveBeenCalledWith("/tournaments/t1/managers/u1/squad");
});
it("keeps manager names non-interactive while squad disclosure is locked", async () => {
  api.mockImplementation((path) =>
    Promise.resolve(
      path.endsWith("/squad-disclosure")
        ? { allowed: false }
        : [
            {
              user: "u1",
              name: "Aarav",
              points: 15,
              rank: 1,
              matchesCounted: 1,
            },
          ],
    ),
  );
  render(
    <MemoryRouter>
      <Leaderboard tournament="t1" />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText(
      /Manager squads are revealed once rosters are locked/,
    ),
  ).toBeTruthy();
  expect(screen.getByText("Aarav")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Aarav" })).toBeNull();
  expect(api).not.toHaveBeenCalledWith("/tournaments/t1/managers/u1/squad");
});
it("waits for restoration and hides admin controls from normal users", async () => {
  localStorage.setItem("sfl-token", "existing");
  let restore;
  api.mockImplementation((path) =>
    path === "/auth/me"
      ? new Promise((r) => (restore = r))
      : Promise.resolve([]),
  );
  render(<App />);
  expect(screen.queryByText("Admin studio")).toBeNull();
  await waitFor(() => expect(restore).toBeTruthy());
  restore({ _id: "u1", name: "Manager", role: "user" });
  await waitFor(() => expect(screen.getByText("Manager")).toBeTruthy());
  expect(screen.queryByText("Admin studio")).toBeNull();
});
it("restored admin sees administrative controls and logout clears session", async () => {
  localStorage.setItem("sfl-token", "existing");
  api.mockImplementation((path) =>
    Promise.resolve(
      path === "/auth/me"
        ? { _id: "a1", name: "Administrator", role: "admin" }
        : [],
    ),
  );
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByText("Admin studio")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Log out ↗" }));
  expect(localStorage.getItem("sfl-token")).toBeNull();
  expect(screen.queryByText("Admin studio")).toBeNull();
});
it("fixture tab renders match date, score and detail link", async () => {
  window.history.replaceState({}, "", "/tournaments/t1");
  api.mockImplementation((path) =>
    Promise.resolve(
      path === "/tournaments/t1"
        ? t
        : path.includes("/teams")
          ? []
          : [
              {
                _id: "m1",
                homeTeam: { name: "Falcons" },
                awayTeam: { name: "Wolves" },
                scheduledAt: "2026-11-01T12:00:00Z",
                venue: "Campus ground",
                status: "completed",
                homeScore: 2,
                awayScore: 1,
              },
            ],
    ),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("tab", { name: "Fixtures" }));
  expect(await screen.findByText("2 : 1")).toBeTruthy();
  expect(
    screen.getByText("Campus ground ↗").closest("a").getAttribute("href"),
  ).toBe("/matches/m1");
});

it("loads every page of team selectors rather than truncating at 100", async () => {
  const teams = Array.from({ length: 101 }, (_, i) => ({
    _id: `team${i}`,
    name: `Team ${i}`,
  }));
  api.mockImplementation((path) =>
    Promise.resolve(
      path.includes("/teams")
        ? path.includes("page=2")
          ? teams.slice(100)
          : teams.slice(0, 100)
        : [p],
    ),
  );
  render(
    <MemoryRouter>
      <PlayerBrowser tournament="t1" />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("option", { name: "Team 100" })).toBeTruthy();
  expect(api).toHaveBeenCalledWith("/tournaments/t1/teams?page=2&limit=100");
});
