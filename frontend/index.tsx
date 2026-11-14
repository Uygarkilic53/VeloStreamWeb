function applyStoredThemeBeforeMount(): void {
  try {
    document.documentElement.classList.remove("dark");
    document.documentElement.dataset.theme = "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
}

export function Document() {
  const bootstrapThemeScript = `(${applyStoredThemeBeforeMount.toString()})();`;

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
