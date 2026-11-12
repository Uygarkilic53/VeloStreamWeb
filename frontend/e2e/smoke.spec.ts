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
      (locationUrl.includes("localhost:3001") || locationUrl.includes("localhost:3002")) &&
      (text.includes("ERR_CONNECTION_REFUSED") || text.includes("Failed to load resource"));

    if (!isExpectedOfflineBackendProbe) {
      consoleErrors.push(`${text} (${locationUrl})`);
    }
  });

  return { pageErrors, consoleErrors };
}

async function stubOfflineBackends(page: Page) {
  await page.route("http://localhost:3001/**", (route) => route.abort("connectionrefused"));
  await page.route("http://localhost:3002/**", (route) => route.abort("connectionrefused"));
}

test("defaults to light mode, requires cookie consent on entry, and remembers dark mode in cookies while signed out", async ({
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
  await expect(dialog.getByText("velostream_theme")).toBeVisible();

  // Default theme is Light Mode before consent
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/\bdark\b/);

  // Accept cookies to enter app
  await dialog.getByRole("button", { name: /accept cookies & enter velostream/i }).click();
  await expect(dialog).toBeHidden();

  // Verify initial signed-out state and cookie values
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  let cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "velostream_cookie_consent")?.value).toBe("accepted");
  expect(cookies.find((c) => c.name === "velostream_theme")?.value).toBe("light");

  // Toggle Dark Mode while NOT signed in
  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await expect(html).toHaveClass(/\bdark\b/);

  cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "velostream_theme")?.value).toBe("dark");

  // Reload browser while signed out: gate stays closed and Dark Mode persists
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: /accept cookies to enter velostream/i }),
  ).toBeHidden();
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();

  // Toggle back to Light Mode and verify it also persists across reload
  await page.getByRole("button", { name: /switch to light mode/i }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);
  await page.reload();
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
  await page.route("http://localhost:3002/**", (route) => route.abort("connectionrefused"));

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
