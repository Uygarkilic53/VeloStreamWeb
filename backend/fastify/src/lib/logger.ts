import type { FastifyBaseLogger, FastifyLoggerOptions } from "fastify";

export type LogStreamDestination = NonNullable<FastifyLoggerOptions["stream"]>;

const PINO_LEVEL_LABELS: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO ",
  40: "WARN ",
  50: "ERROR",
  60: "FATAL",
};

const IGNORED_KEYS = new Set(["level", "time", "pid", "hostname", "v", "reqId", "msg", "err"]);

function formatTime(epochMs?: number): string {
  const date = typeof epochMs === "number" && Number.isFinite(epochMs) ? new Date(epochMs) : new Date();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatLevel(rawLevel: unknown): string {
  if (typeof rawLevel === "number") {
    return PINO_LEVEL_LABELS[rawLevel] ?? `L${rawLevel}`.padEnd(5);
  }
  if (typeof rawLevel === "string" && rawLevel.trim().length > 0) {
    return rawLevel.trim().toUpperCase().slice(0, 5).padEnd(5);
  }
  return "INFO ";
}

function formatExtraValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function extractErrorDetails(errField: unknown): { message?: string; stack?: string } {
  if (!errField) {
    return {};
  }
  if (typeof errField === "string") {
    return { message: errField };
  }
  if (typeof errField === "object") {
    const record = errField as Record<string, unknown>;
    return {
      ...(typeof record.message === "string" && record.message.length > 0
        ? { message: record.message }
        : {}),
      ...(typeof record.stack === "string" && record.stack.length > 0
        ? { stack: record.stack }
        : {}),
    };
  }
  return { message: String(errField) };
}

/**
 * Formats a structured log record into a single human-readable line (with optional error stack).
 * Returns `null` when both message and metadata are empty (e.g. suppressed listen lines).
 */
export function formatLogRecord(record: Record<string, unknown>): string | null {
  const timestamp = formatTime(typeof record.time === "number" ? record.time : undefined);
  const level = formatLevel(record.level);
  const rawMsg = typeof record.msg === "string" ? record.msg.trim() : "";

  const extras: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (IGNORED_KEYS.has(key) || value === undefined) {
      continue;
    }
    extras.push(`${key}=${formatExtraValue(value)}`);
  }

  const errDetails = extractErrorDetails(record.err);
  const parts: string[] = [];
  if (rawMsg) {
    parts.push(rawMsg);
  }
  if (errDetails.message && errDetails.message !== rawMsg) {
    parts.push(rawMsg ? `(${errDetails.message})` : errDetails.message);
  }
  if (extras.length > 0) {
    parts.push(extras.join(" "));
  }

  if (parts.length === 0 && !errDetails.stack) {
    return null;
  }

  const head = `[${timestamp}] ${level} ${parts.join(" ")}`.trimEnd();
  return errDetails.stack ? `${head}\n${errDetails.stack}` : head;
}

/**
 * Formats a raw Pino JSON log line into a concise plain-text line.
 * Falls back to returning non-JSON lines unchanged.
 */
export function formatLogLine(rawLine: string): string | null {
  const trimmed = rawLine.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return formatLogRecord(parsed as Record<string, unknown>);
      }
    } catch {
      // Fall through to plain-text output when input is not valid JSON.
    }
  }

  return trimmed;
}

/**
 * Creates a Fastify/Pino destination stream that formats JSON log lines as plain text.
 */
export function createPrettyLogStream(
  output: Pick<NodeJS.WritableStream, "write"> = process.stdout,
): LogStreamDestination {
  return {
    write(chunk: string): void {
      for (const line of chunk.split(/\r?\n/)) {
        const formatted = formatLogLine(line);
        if (formatted !== null) {
          output.write(`${formatted}\n`);
        }
      }
    },
  };
}

/**
 * Builds Fastify logger options using the concise plain-text stream.
 */
export function createFastifyLoggerOptions(options?: {
  level?: string;
  output?: Pick<NodeJS.WritableStream, "write">;
}): FastifyLoggerOptions {
  return {
    level: options?.level ?? "info",
    stream: createPrettyLogStream(options?.output),
  };
}

/**
 * Creates a standalone logger matching Fastify's concise plain-text format
 * for startup helpers that run before `buildApp()`.
 */
export function createSimpleLogger(
  output: Pick<NodeJS.WritableStream, "write"> = process.stdout,
): Pick<FastifyBaseLogger, "info" | "warn" | "error"> {
  const emit = (level: number, objOrMsg: unknown, maybeMsg?: string): void => {
    const record: Record<string, unknown> = {
      level,
      time: Date.now(),
    };

    if (typeof objOrMsg === "string") {
      record.msg = objOrMsg;
    } else if (objOrMsg instanceof Error) {
      record.err = { message: objOrMsg.message, stack: objOrMsg.stack };
      if (maybeMsg) {
        record.msg = maybeMsg;
      }
    } else if (objOrMsg && typeof objOrMsg === "object") {
      Object.assign(record, objOrMsg);
      if (maybeMsg) {
        record.msg = maybeMsg;
      }
    } else if (maybeMsg) {
      record.msg = maybeMsg;
    }

    const formatted = formatLogRecord(record);
    if (formatted !== null) {
      output.write(`${formatted}\n`);
    }
  };

  return {
    info: (objOrMsg: unknown, maybeMsg?: string) => emit(30, objOrMsg, maybeMsg),
    warn: (objOrMsg: unknown, maybeMsg?: string) => emit(40, objOrMsg, maybeMsg),
    error: (objOrMsg: unknown, maybeMsg?: string) => emit(50, objOrMsg, maybeMsg),
  };
}
