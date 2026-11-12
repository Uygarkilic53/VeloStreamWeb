import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/App";
import { acceptCookiesWithTheme, clearPreferenceCookies } from "./cookies";

describe("Index searchbar, user search (online & offline), and health removal", () => {
  beforeEach(() => {
    clearPreferenceCookies();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    acceptCookiesWithTheme("light");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearPreferenceCookies();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("removes Core API / Real-Time Engine / Standby health status UI and does not probe /healthz", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ query: "", users: [], relatedLiveUsers: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(<App />);

    expect(screen.queryByText(/core api/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/real-time engine/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/services ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/standby/i)).not.toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/healthz"))).toBe(false);
  });

  it("searches offline and online users by username or displayName, renders avatar/username/name, and shows related live users underneath", async () => {
    const offlineAvatar = "https://res.cloudinary.com/demo/image/upload/v1/VeloStream/avatar/uygar.png";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/users/search")) {
        return new Response(
          JSON.stringify({
            query: "uygar",
            users: [
              {
                id: "usr_offline_1",
                username: "uygar_dev",
                displayName: "Uygar Yilmaz",
                avatarUrl: offlineAvatar,
                bio: "Offline systems streamer",
                isLive: false,
                channelTitle: "Go & Rust notes",
                channelCategory: "Programming",
              },
            ],
            relatedLiveUsers: [
              {
                id: "usr_live_1",
                username: "mira_codes",
                displayName: "Mira Vance",
                avatarUrl: null,
                bio: "Rust graphics engine",
                isLive: true,
                channelTitle: "Building a custom 2D lighting engine in Rust from scratch",
                channelCategory: "Programming",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<App />);

    const searchInput = screen.getByRole("searchbox", {
      name: /search users, streams, or categories/i,
    });
    await user.type(searchInput, "uygar");

    const dropdown = await screen.findByRole("region", { name: /search results/i });
    await waitFor(() => {
      expect(within(dropdown).getByText("Uygar Yilmaz")).toBeInTheDocument();
    });

    expect(within(dropdown).getByText("@uygar_dev")).toBeInTheDocument();
    expect(within(dropdown).getByText("Offline")).toBeInTheDocument();
    const avatarImg = within(dropdown).getByAltText(/uygar yilmaz profile avatar/i);
    expect(avatarImg).toHaveAttribute("src", offlineAvatar);

    // Related live users appear directly underneath Users
    expect(within(dropdown).getByText("Related live users")).toBeInTheDocument();
    expect(within(dropdown).getByText("Mira Vance")).toBeInTheDocument();
    expect(within(dropdown).getByText("@mira_codes")).toBeInTheDocument();

    // Index page also renders Users + Related live users sections
    const usersSection = screen.getByRole("region", { name: /matching users/i });
    expect(within(usersSection).getByText("Uygar Yilmaz")).toBeInTheDocument();
    const relatedSection = screen.getByRole("region", { name: /related live users/i });
    expect(within(relatedSection).getByText(/@mira_codes/i)).toBeInTheDocument();

    // Clicking the offline user opens their channel stage (showing OFFLINE, not another creator)
    await user.click(within(dropdown).getByRole("button", { name: /uygar yilmaz/i }));
    expect(await screen.findByText("OFFLINE")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /go & rust notes/i })).toBeInTheDocument();
  });
});
