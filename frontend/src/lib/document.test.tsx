import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Document from "../../index";
import { clearPreferenceCookies, acceptCookiesWithTheme } from "./cookies";

describe("TSX root Document (index.tsx)", () => {
  beforeEach(() => {
    clearPreferenceCookies();
    document.documentElement.className = "";
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    clearPreferenceCookies();
    document.documentElement.className = "";
    delete document.documentElement.dataset.theme;
  });

  it("renders valid HTML5 document structure, root mount node, and main.tsx module entry", () => {
    const html = renderToStaticMarkup(<Document />);

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain("<title>VeloStream — Live Streaming Platform</title>");
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(html).toMatch(/<body class="[^"]*m-2[^"]*sm:m-4/);
  });

  it("emits a working pre-mount bootstrap script that defaults to light and honors accepted dark cookie", () => {
    const html = renderToStaticMarkup(<Document />);
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch?.[1]).toBeTruthy();

    const runBootstrapScript = new Function(scriptMatch?.[1] ?? "");

    // Without consent cookies, Light Mode is enforced.
    runBootstrapScript();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");

    // With accepted dark theme cookie, Dark Mode activates synchronously before mount.
    acceptCookiesWithTheme("dark");
    runBootstrapScript();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
