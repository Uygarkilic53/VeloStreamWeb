import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const FASTIFY_ROOT = path.resolve(MODULE_DIR, "../..");
export const REPO_ROOT = path.resolve(FASTIFY_ROOT, "../..");

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseDotEnv(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eqIdx = normalized.indexOf("=");
    if (eqIdx <= 0) {
      continue;
    }
    const key = normalized.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let val = normalized.slice(eqIdx + 1).trim();
    if (!val.startsWith('"') && !val.startsWith("'")) {
      const commentIdx = val.indexOf(" #");
      if (commentIdx !== -1) {
        val = val.slice(0, commentIdx).trim();
      }
    }
    parsed[key] = stripQuotes(val);
  }
  return parsed;
}

/**
 * Loads `.env` values into `targetEnv` without overriding variables that were
 * already provided by the process environment or a higher-precedence file.
 * Precedence order: fastify `.env` -> backend `.env` -> repository root `.env`.
 */
export function loadFastifyEnv(targetEnv: NodeJS.ProcessEnv = process.env): string[] {
  const candidates = [
    path.join(FASTIFY_ROOT, ".env"),
    path.resolve(FASTIFY_ROOT, "..", ".env"),
    path.join(REPO_ROOT, ".env"),
  ];

  const loadedFrom: string[] = [];
  const preExistingKeys = new Set(
    Object.keys(targetEnv).filter((key) => targetEnv[key] !== undefined),
  );

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    const entries = parseDotEnv(readFileSync(filePath, "utf8"));
    for (const [key, value] of Object.entries(entries)) {
      if (!preExistingKeys.has(key) && targetEnv[key] === undefined) {
        targetEnv[key] = value;
      }
    }
    loadedFrom.push(filePath);
  }

  return loadedFrom;
}

