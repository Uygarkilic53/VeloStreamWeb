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

test("validates signup inputs inline, registers via Core API, persists session across reload, and manages profile", async ({
  page,
}) => {
  const { pageErrors, consoleErrors } = attachRuntimeMonitors(page);

  await page.route("http://localhost:3002/**", (route) => route.abort("connectionrefused"));

  let currentProfile = {
    id: "usr_e2e_1",
    username: "creator_e2e",
    displayName: "E2E Creator",
    email: "creator_e2e@velostream.dev",
    bio: "",
    avatarUrl: null as string | null,
    role: "USER",
    theme: "light" as "light" | "dark",
    channel: {
      id: "ch_e2e_1",
      slug: "creator_e2e",
      title: "E2E Creator's live broadcast",
      category: "Programming",
      streamKey: "live_initial_e2e_key",
      slowMode: false,
      isLive: false,
    },
    bannedUsers: [],
    followedSlugs: [],
  };

  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();

    if (url.pathname === "/api/v1/auth/register" && method === "POST") {
      const body = req.postDataJSON() as { username: string; displayName?: string; email: string };
      if (body.username.toLowerCase() === "taken_name") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "USERNAME_TAKEN",
            message: "That username is already registered.",
            fieldErrors: {
              username: ["That username is already registered."],
            },
          }),
        });
        return;
      }
      currentProfile = {
        ...currentProfile,
        username: body.username,
        displayName: body.displayName ?? body.username,
        email: body.email,
        channel: {
          ...currentProfile.channel,
          slug: body.username,
        },
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "e2e-jwt-token",
          refreshToken: "e2e-refresh-token",
          expiresIn: 900,
          tokenType: "Bearer",
          message: "Account created successfully.",
          user: currentProfile,
        }),
      });
      return;
    }

    if (url.pathname === "/api/v1/auth/me" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: currentProfile }),
      });
      return;
    }

    if (url.pathname === "/api/v1/users/me" && method === "PATCH") {
      const body = req.postDataJSON() as {
        displayName: string;
        username: string;
        email: string;
        bio: string;
      };
      currentProfile = {
        ...currentProfile,
        displayName: body.displayName,
        username: body.username,
        email: body.email,
        bio: body.bio,
        channel: {
          ...currentProfile.channel,
          slug: body.username,
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: currentProfile, accessToken: "e2e-jwt-token-2" }),
      });
      return;
    }

    if (url.pathname === "/api/v1/users/me/theme" && method === "PATCH") {
      const body = req.postDataJSON() as { theme: "light" | "dark" };
      currentProfile = {
        ...currentProfile,
        theme: body.theme,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: currentProfile }),
      });
      return;
    }

    if (url.pathname === "/api/v1/users/me/avatar" && method === "POST") {
      currentProfile = {
        ...currentProfile,
        avatarUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: currentProfile, avatarUrl: currentProfile.avatarUrl }),
      });
      return;
    }

    if (url.pathname === "/api/v1/users/me/avatar" && method === "DELETE") {
      currentProfile = {
        ...currentProfile,
        avatarUrl: null,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: currentProfile, avatarUrl: null }),
      });
      return;
    }

    if (url.pathname === "/api/v1/channels/me/stream-key/rotate" && method === "POST") {
      currentProfile = {
        ...currentProfile,
        channel: {
          ...currentProfile.channel,
          streamKey: "live_rotated_e2e_key",
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ streamKey: currentProfile.channel.streamKey }),
      });
      return;
    }

    if (url.pathname === "/api/v1/auth/logout" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, message: "Logged out successfully." }),
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

  await page.getByRole("button", { name: /^sign up$/i }).click();
  const signUpForm = page.getByRole("form", { name: /create account form/i });
  await expect(page.getByText(/channel handle/i)).toHaveCount(0);

  // Client-side validation catches invalid @username, short username, & password mismatch before submit
  await signUpForm.getByLabel(/^username$/i).fill("@bad_handle");
  await signUpForm.getByLabel(/email address/i).fill("bad");
  await signUpForm.getByLabel(/^password$/i).fill("StrongPass123");
  await signUpForm.getByLabel(/confirm password/i).fill("DifferentPass");
  await signUpForm.getByRole("button", { name: /^create account$/i }).click();
  await expect(
    signUpForm.getByText(/username may only contain letters, numbers, and underscores\./i),
  ).toBeVisible();
  await expect(signUpForm.getByText(/passwords do not match/i)).toBeVisible();

  await signUpForm.getByLabel(/^username$/i).fill("x");
  await signUpForm.getByRole("button", { name: /^create account$/i }).click();
  await expect(signUpForm.getByText(/username must be at least 3 characters\./i)).toBeVisible();

  // Duplicate username rejected by backend (409 USERNAME_TAKEN)
  await signUpForm.getByLabel(/^username$/i).fill("taken_name");
  await signUpForm.getByLabel(/email address/i).fill("creator_e2e@velostream.dev");
  await signUpForm.getByLabel(/^password$/i).fill("StrongPass123");
  await signUpForm.getByLabel(/confirm password/i).fill("StrongPass123");
  await signUpForm.getByRole("button", { name: /^create account$/i }).click();
  await expect(signUpForm.locator("#auth-username-error")).toHaveText(
    /that username is already registered\./i,
  );
  await expect(page.getByText(/that username is already registered\./i).first()).toBeVisible();

  // Fill valid unique registration form and submit
  await signUpForm.getByLabel(/^username$/i).fill("creator_e2e");
  await signUpForm.getByLabel(/display name/i).fill("E2E Creator");
  await signUpForm.getByLabel(/email address/i).fill("creator_e2e@velostream.dev");
  await signUpForm.getByLabel(/^password$/i).fill("StrongPass123");
  await signUpForm.getByLabel(/confirm password/i).fill("StrongPass123");
  await signUpForm.getByRole("button", { name: /^create account$/i }).click();

  await expect(page.getByRole("button", { name: /@creator_e2e/i })).toBeVisible();
  await expect(page.getByText(/account created successfully\./i)).toBeVisible();

  // Verify velostream_remember_session cookie was created on signup with remember-me
  const cookiesBeforeShutdown = await page.context().cookies();
  expect(
    cookiesBeforeShutdown.find((c) => c.name === "velostream_remember_session")?.value,
  ).toBeTruthy();

  // Simulate server shutdown: abort /api/v1/auth/me with connectionrefused
  await page.route("**/api/v1/auth/me", (route) => route.abort("connectionrefused"));

  // Reload browser with server shut down: user remains signed in via remember-me cookie!
  await page.reload();
  await expect(page.getByRole("button", { name: /@creator_e2e/i })).toBeVisible();

  // Unroute offline /auth/me stub so subsequent backend updates can succeed
  await page.unroute("**/api/v1/auth/me");

  // Open ProfilePage and verify backend-authenticated state + Username label + circular avatar upload + profile update + stream key rotation
  await page.getByRole("button", { name: /@creator_e2e/i }).click();
  await expect(page.getByText("Authenticated")).toBeVisible();
  await expect(page.getByLabel(/^username$/i)).toHaveValue("creator_e2e");
  await expect(page.getByText(/channel handle/i)).toHaveCount(0);

  await page.getByLabel(/upload profile avatar/i).setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  await expect(page.getByText(/profile photo updated\./i)).toBeVisible();
  await expect(page.getByAltText(/e2e creator profile avatar/i).first()).toBeVisible();

  await page.getByLabel(/channel bio/i).fill("Live Go and WebRTC streaming.");
  await page.getByRole("button", { name: /save profile/i }).click();
  await expect(page.getByText(/public profile updated\./i)).toBeVisible();

  await page.getByRole("tab", { name: /channel & stream key/i }).click();
  await page.getByRole("button", { name: /^rotate key$/i }).click();
  await page.getByRole("button", { name: /^reveal$/i }).click();
  await expect(page.getByLabel(/primary stream key/i)).toHaveValue("live_rotated_e2e_key");

  await page.getByRole("button", { name: /^sign out$/i }).first().click();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  await expect(page.getByText(/logged out successfully\./i)).toBeVisible();

  const cookiesAfterSignOut = await page.context().cookies();
  expect(
    cookiesAfterSignOut.find((c) => c.name === "velostream_remember_session"),
  ).toBeUndefined();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

