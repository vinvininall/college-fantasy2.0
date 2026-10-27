// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { App } from "./App";
import { Session } from "./session";
import { AuthPage } from "./pages/Auth";
import { PlayerBrowser, Leaderboard } from "./pages/Tournaments";
import { SquadBuilder } from "./pages/Squad";
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
