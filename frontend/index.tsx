import {
  COOKIE_CONSENT_ACCEPTED,
  COOKIE_CONSENT_NAME,
  COOKIE_THEME_NAME,
} from "./src/lib/cookies";

function applyStoredThemeBeforeMount(
  consentName: string,
  acceptedValue: string,
  themeName: string,
): void {
  try {
    const pairs = document.cookie ? document.cookie.split(";") : [];
    let consent = "";
    let theme = "";
    for (let i = 0; i < pairs.length; i += 1) {
      const pair = pairs[i] ?? "";
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      const k = pair.slice(0, idx).trim();
      const v = decodeURIComponent(pair.slice(idx + 1).trim());
      if (k === consentName) consent = v;
      if (k === themeName) theme = v;
    }
    if (consent === acceptedValue && theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.dataset.theme = "dark";
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.dataset.theme = "light";
    }
  } catch {
    document.documentElement.dataset.theme = "light";
  }
}

export function Document() {
  const bootstrapThemeScript = `(${applyStoredThemeBeforeMount.toString()})(${JSON.stringify(
    COOKIE_CONSENT_NAME,
  )},${JSON.stringify(COOKIE_CONSENT_ACCEPTED)},${JSON.stringify(COOKIE_THEME_NAME)});`;

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <title>VeloStream — Live Streaming Platform</title>
        <script dangerouslySetInnerHTML={{ __html: bootstrapThemeScript }} />
      </head>
      <body className="m-2 sm:m-4 bg-[var(--vs-canvas)] text-[var(--vs-text)] antialiased selection:bg-[var(--vs-accent)]/20">
        <div id="root" />
        <script type="module" src="/src/main.tsx" />
      </body>
    </html>
  );
}

export default Document;
