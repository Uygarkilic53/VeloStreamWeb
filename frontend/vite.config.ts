import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, defineConfig, normalizePath, type Plugin, type ViteDevServer } from "vite";

const FRONTEND_ROOT = path.dirname(fileURLToPath(import.meta.url));
const VIRTUAL_INDEX_HTML_ID = normalizePath(path.resolve(FRONTEND_ROOT, "index.html"));

async function renderHtmlFromTsx(server: ViteDevServer): Promise<string> {
  const mod = (await server.ssrLoadModule("/index.tsx")) as { default: ComponentType };
  const markup = renderToStaticMarkup(createElement(mod.default));
  return `<!doctype html>\n${markup}`;
}

function tsxDocumentEntryPlugin(): Plugin {
  let rootDir = FRONTEND_ROOT;

  return {
    name: "velostream:tsx-document-entry",
    config(userConfig) {
      return {
        build: {
          rollupOptions: {
            input: userConfig.build?.rollupOptions?.input ?? VIRTUAL_INDEX_HTML_ID,
          },
        },
      };
    },
    configResolved(config) {
      rootDir = config.root;
    },
    resolveId(source) {
      const normalizedSource = normalizePath(source);
      if (
        normalizedSource === "index.html" ||
        normalizedSource === "/index.html" ||
        normalizedSource === VIRTUAL_INDEX_HTML_ID
      ) {
        return VIRTUAL_INDEX_HTML_ID;
      }
      return null;
    },
    async load(id) {
      if (normalizePath(id) !== VIRTUAL_INDEX_HTML_ID) {
        return null;
      }
      const ssrServer = await createServer({
        configFile: false,
        root: rootDir,
        logLevel: "silent",
        plugins: [],
        server: { middlewareMode: true, hmr: false },
        appType: "custom",
        optimizeDeps: { noDiscovery: true },
      });
      try {
        return await renderHtmlFromTsx(ssrServer);
      } finally {
        await ssrServer.close();
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET" || !req.url) {
          next();
          return;
        }
        const pathname = req.url.split("?")[0] ?? "/";
        const acceptsHtml = req.headers.accept?.includes("text/html") ?? false;
        const isInternalOrAsset =
          pathname.startsWith("/@") ||
          pathname.startsWith("/src/") ||
          pathname.startsWith("/node_modules/") ||
          (pathname.includes(".") && pathname !== "/index.html");

        if (pathname === "/" || pathname === "/index.html" || (acceptsHtml && !isInternalOrAsset)) {
          try {
            const rawHtml = await renderHtmlFromTsx(server);
            const transformedHtml = await server.transformIndexHtml(req.url, rawHtml);
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(transformedHtml);
            return;
          } catch (error) {
            next(error);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [tsxDocumentEntryPlugin(), react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
