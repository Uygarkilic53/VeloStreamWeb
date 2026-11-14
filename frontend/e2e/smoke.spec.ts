import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

function attachRuntimeMonitors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error") {
      return;
    }
    const locationUrl = message.location().url ?? "";
    const text = message.text();
    const isExpectedOfflineBackendProbe =
      (locationUrl.includes("localhost:3001") ||
        locationUrl.includes("localhost:3002") ||
        locationUrl.includes("localhost:8888") ||
        locationUrl.includes("localhost:8889") ||
        text.includes("localhost:3001") ||
        text.includes("localhost:3002") ||
        text.includes("localhost:8888") ||
        text.includes("localhost:8889") ||
        text.includes("3002/ws") ||
        text.includes("ws://") ||
        text.includes("WebSocket")) &&
      (text.includes("ERR_CONNECTION_REFUSED") ||
        text.includes("Failed to load resource") ||
        text.includes("WebSocket") ||
        text.includes("net::ERR_CONNECTION_REFUSED") ||
        text.includes("failed"));

    if (!isExpectedOfflineBackendProbe) {
      consoleErrors.push(`${text} (${locationUrl})`);
    }
  });

  return { pageErrors, consoleErrors };
}

async function stubOfflineBackends(page: Page) {
  await page.route("http://localhost:3001/**", (route) => route.abort("connectionrefused"));
  await page.route("http://localhost:3002/**", (route) => route.abort("connectionrefused"));
  await page.route("http://localhost:8888/**", (route) => route.abort("connectionrefused"));
  await page.route("http://localhost:8889/**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        headers: {
          Location: `${route.request().url()}/sess_mock`,
          "Content-Type": "application/sdp",
        },
        body: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
      });
      return;
    }
    await route.fulfill({ status: 200 });
  });
}

test("defaults to light mode, requires cookie consent on entry, and manages theme via user preference in profile settings (not stored as all-users cookie)", async ({
  page,
  context,
}) => {
  const { pageErrors, consoleErrors } = attachRuntimeMonitors(page);
  await stubOfflineBackends(page);
  await page.goto("/");

  // Cookie gate blocks entry and explains stored cookies
  const dialog = page.getByRole("dialog", { name: /accept cookies to enter velostream/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("velostream_cookie_consent")).toBeVisible();
  await expect(dialog.getByText("velostream_theme")).toHaveCount(0);

  // Default theme is Light Mode before consent
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/\bdark\b/);

  // Accept cookies to enter app
  await dialog.getByRole("button", { name: /accept cookies & enter velostream/i }).click();
  await expect(dialog).toBeHidden();

  // Verify initial signed-out state and cookie values
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "velostream_cookie_consent")?.value).toBe("accepted");
  // velostream_theme cookie must NOT be set
  expect(cookies.find((c) => c.name === "velostream_theme")).toBeUndefined();

  // Theme toggle is NOT in the navbar
  await expect(page.getByRole("button", { name: /switch to dark mode/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /switch to light mode/i })).toHaveCount(0);

  // Sign in to local preview session to verify user preference theme in profile
  await page.getByRole("button", { name: /^sign in$/i }).click();
  const signInForm = page.getByRole("form", { name: /sign in form/i });
  await signInForm.getByLabel(/username or email/i).fill("theme_tester");
  await signInForm.getByLabel(/^password$/i).fill("StrongPass123");
  await signInForm.getByRole("button", { name: /^sign in$/i }).click();

  const previewBtn = page.getByRole("button", { name: /continue in local preview session/i });
  await expect(previewBtn).toBeVisible();
  await previewBtn.click();

  // Open profile page (defaults to public profile tab where Appearance is located)
  await page.getByRole("button", { name: /@theme_tester/i }).click();
  await expect(page.getByRole("heading", { name: /appearance/i })).toBeVisible();

  // Switch to dark mode via profile appearance settings
  await page.getByRole("button", { name: /dark mode/i }).click();
  await expect(html).toHaveClass(/\bdark\b/);

  // Switch back to light mode
  await page.getByRole("button", { name: /light mode/i }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("navigates Twitch-like discovery directory, watch view, auth, profile settings, and broadcast studio cleanly", async ({
  page,
}) => {
  const { pageErrors, consoleErrors } = attachRuntimeMonitors(page);
  await stubOfflineBackends(page);
  await page.goto("/");

  await page.getByRole("button", { name: /accept cookies & enter velostream/i }).click();

  // Directory displays categories and streams without donation UI
  const categoryBar = page.getByRole("tablist", { name: /stream categories/i });
  await expect(categoryBar.getByRole("tab", { name: /Gaming/i })).toBeVisible();
  await expect(categoryBar.getByRole("tab", { name: /Just Chatting/i })).toBeVisible();
  await expect(categoryBar.getByRole("tab", { name: /Programming/i })).toBeVisible();

  await categoryBar.getByRole("tab", { name: /Programming/i }).click();
  await page
    .getByRole("button", { name: /building a custom 2d lighting engine in rust/i })
    .click();

  await expect(
    page.getByRole("heading", { name: /building a custom 2d lighting engine in rust/i }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /stream chat/i })).toBeVisible();

  // Auth Sign Up -> Sign In -> Local preview session
  await page.getByRole("button", { name: /^sign up$/i }).click();
  await expect(
    page.getByRole("heading", { name: /create your creator account/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const signInForm = page.getByRole("form", { name: /sign in form/i });
  await signInForm.getByLabel(/username or email/i).fill("e2e_creator");
  await signInForm.getByLabel(/^password$/i).fill("StrongPass123");
  await signInForm.getByRole("button", { name: /^sign in$/i }).click();

  const previewBtn = page.getByRole("button", { name: /continue in local preview session/i });
  await expect(previewBtn).toBeVisible();
  await previewBtn.click();

  // Profile page stream key + moderation controls
  await page.getByRole("button", { name: /@e2e_creator/i }).click();
  await expect(page.getByRole("tab", { name: /public profile/i })).toBeVisible();

  await page.getByRole("tab", { name: /channel & stream key/i }).click();
  await page.getByRole("button", { name: /^reveal$/i }).click();
  await expect(page.getByLabel(/primary stream key/i)).toHaveValue(/^sk_live_/);

  await page.getByRole("tab", { name: /moderation & bans/i }).click();
  await expect(page.getByText(/banned users \(2\)/i)).toBeVisible();
  await expect(page.getByText(/@spam_bot_99/i)).toBeVisible();
  await page.getByRole("button", { name: /^unban$/i }).first().click();
  await expect(page.getByText(/banned users \(1\)/i)).toBeVisible();
  await expect(page.getByText(/unbanned @spam_bot_99\./i)).toBeVisible();

  // Broadcast Studio "Go live" without horizontal overflow
  await page.getByRole("button", { name: /open broadcast studio/i }).click();
  const studioMain = page.getByRole("main", { name: /broadcast studio/i });
  await expect(studioMain.getByRole("heading", { name: /broadcast studio/i })).toBeVisible();
  await studioMain.getByRole("button", { name: /go live/i }).click();
  await expect(studioMain.getByRole("button", { name: /end broadcast/i })).toBeVisible();

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasOverflow).toBe(false);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("index searchbar searches online and offline users with avatar, username, display name, and related live users underneath, without health panel", async ({
  page,
}) => {
  const { pageErrors, consoleErrors } = attachRuntimeMonitors(page);
  await stubOfflineBackends(page);

  const avatarDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/users/search") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          query: url.searchParams.get("q") ?? "",
          users: [
            {
              id: "usr_offline_e2e",
              username: "offline_creator",
              displayName: "Offline Creator",
              avatarUrl: avatarDataUrl,
              bio: "Offline creator bio",
              isLive: false,
              channelTitle: "Offline Channel Notes",
              channelCategory: "Programming",
            },
          ],
          relatedLiveUsers: [
            {
              id: "usr_live_e2e",
              username: "mira_codes",
              displayName: "Mira Vance",
              avatarUrl: null,
              bio: "Rust engine",
              isLive: true,
              channelTitle: "Building a custom 2D lighting engine in Rust from scratch",
              channelCategory: "Programming",
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "NOT_FOUND", message: "Not found" }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /accept cookies & enter velostream/i }).click();

  await expect(page.getByText(/core api/i)).toHaveCount(0);
  await expect(page.getByText(/real-time engine/i)).toHaveCount(0);
  await expect(page.getByText(/^standby$/i)).toHaveCount(0);

  const searchInput = page.getByRole("searchbox", {
    name: /search users, streams, or categories/i,
  });
  await searchInput.fill("offline_creator");

  const dropdown = page.getByRole("region", { name: /search results/i });
  await expect(dropdown).toBeVisible();
  await expect(dropdown.getByText("Offline Creator")).toBeVisible();
  await expect(dropdown.getByText("@offline_creator")).toBeVisible();
  await expect(dropdown.getByText("Offline", { exact: true })).toBeVisible();
  await expect(dropdown.getByAltText(/offline creator profile avatar/i)).toHaveAttribute(
    "src",
    avatarDataUrl,
  );
  await expect(dropdown.getByText("Related live users")).toBeVisible();
  await expect(dropdown.getByText("Mira Vance")).toBeVisible();

  await dropdown.getByRole("button", { name: /offline creator/i }).click();
  await expect(page.getByText("OFFLINE", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /offline channel notes/i })).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("displays empty state on both sidebar and homepage when backend reports no live channels and navigates to studio on action", async ({
  page,
}) => {
  const { pageErrors, consoleErrors } = attachRuntimeMonitors(page);
  await stubOfflineBackends(page);

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/channels/live") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ channels: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "NOT_FOUND", message: "Not found" }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /accept cookies & enter velostream/i }).click();

  // Sidebar empty state
  await expect(page.getByText("No live channels")).toBeVisible();
  await expect(page.getByText("Nobody is broadcasting right now.")).toBeVisible();
  await expect(page.getByText("0 on air")).toBeVisible();

  // Homepage empty state
  const emptyHeading = page.getByRole("heading", { name: /no live broadcasts right now/i });
  await expect(emptyHeading).toBeVisible();
  await expect(page.getByText(/nobody is currently streaming on velostream/i)).toBeVisible();

  // Clicking 'Start streaming' navigates to Studio page
  const startStreamingBtns = page.getByRole("button", { name: /start streaming/i });
  await expect(startStreamingBtns.first()).toBeVisible();
  await startStreamingBtns.first().click();

  const studioMain = page.getByRole("main", { name: /broadcast studio/i });
  await expect(studioMain.getByRole("heading", { name: /broadcast studio/i })).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("displays banned view and hides player and chat when authenticated user is banned by channel creator", async ({
  page,
}) => {
  const { pageErrors, consoleErrors } = attachRuntimeMonitors(page);
  await stubOfflineBackends(page);

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "usr_banned_e2e",
            username: "banned_user",
            displayName: "Banned User",
            email: "banned@velostream.dev",
            role: "USER",
            theme: "light",
            channelTitle: "Banned Channel",
            channelCategory: "Programming",
            streamKey: "sk_banned_key",
            slowMode: false,
            bannedUsers: [],
            bannedFromSlugs: ["creator_alice"],
            followedSlugs: [],
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/v1/users/creator_alice") {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "USER_BANNED",
          message: "You have been banned by @creator_alice.",
          banned: true,
          bannedBy: "creator_alice",
          reason: "Chat violation",
        }),
      });
      return;
    }
    if (url.pathname === "/api/v1/channels/live") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ channels: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "NOT_FOUND", message: "Not found" }),
    });
  });

  // Seed authenticated session in localStorage before visiting
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "velostream_auth_session",
      JSON.stringify({
        accessToken: "e2e_jwt_token",
        refreshToken: "e2e_refresh_token",
        rememberSession: true,
      }),
    );
  });

  await page.goto("/?page=watch&channel=creator_alice");
  await page.getByRole("button", { name: /accept cookies & enter velostream/i }).click();

  // Banned view checks
  const bannedHeading = page.getByRole("heading", { name: /channel unavailable/i });
  await expect(bannedHeading).toBeVisible();
  await expect(page.getByText(/@creator_alice has banned you from viewing their channel\./i)).toBeVisible();
  await expect(page.getByText(/chat violation/i)).toBeVisible();

  // Player and chat rail MUST NOT be present
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByLabel(/live stream chat/i)).toHaveCount(0);

  // Browse other channels button navigates to home
  const browseBtn = page.getByRole("button", { name: /browse other channels/i });
  await expect(browseBtn).toBeVisible();
  await browseBtn.click();

  await expect(page.getByRole("heading", { name: /no live broadcasts right now/i })).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("shows live stream preview when hovering on snapshot card and restores snapshot on hover off", async ({
  page,
}) => {
  const { pageErrors, consoleErrors } = attachRuntimeMonitors(page);
  await stubOfflineBackends(page);

  // Pre-seed snapshot for kaelen_fps with a valid 1x1 PNG data URL
  await page.addInitScript(() => {
    localStorage.setItem(
      "velostream_snapshot_kaelen_fps",
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    );
  });

  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: /accept cookies to enter velostream/i });
  await dialog.getByRole("button", { name: /accept cookies & enter velostream/i }).click();

  // Find stream card for kaelen_fps
  const streamCard = page.getByTestId("stream-card-kaelen_fps");
  await expect(streamCard).toBeVisible();

  // Initially displays snapshot badge and image, no video element inside card
  await expect(streamCard.getByText("SNAPSHOT")).toBeVisible();
  await expect(streamCard.getByAltText(/live stream snapshot/i)).toBeVisible();
  await expect(streamCard.locator("video")).toHaveCount(0);

  // Hover on snapshot card
  await streamCard.hover();

  // Live video preview element appears inside card
  await expect(streamCard.locator("video")).toBeVisible();
  await expect(streamCard.locator("video")).toHaveAttribute("data-testid", "stream-hover-video");

  // Move mouse away to banner
  await page.getByRole("banner").hover();

  // Video element is removed and snapshot continues showing
  await expect(streamCard.locator("video")).toHaveCount(0);
  await expect(streamCard.getByText("SNAPSHOT")).toBeVisible();
  await expect(streamCard.getByAltText(/live stream snapshot/i)).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
