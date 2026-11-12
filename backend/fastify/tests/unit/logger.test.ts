import { describe, expect, it } from "vitest";
import {
  createPrettyLogStream,
  createSimpleLogger,
  formatLogLine,
} from "../../src/lib/logger.js";

describe("logger formatting", () => {
  it("formats Pino JSON lines into concise plain text without JSON boilerplate", () => {
    const raw = JSON.stringify({
      level: 30,
      time: new Date(2026, 0, 1, 9, 5, 7).getTime(),
      pid: 19968,
      hostname: "Uygar",
      reqId: "req-1",
      msg: "fastify server is running at http://127.0.0.1:3001",
    });

    expect(formatLogLine(raw)).toBe(
      "[09:05:07] INFO  fastify server is running at http://127.0.0.1:3001",
    );
  });

  it("formats errors and extra metadata cleanly", () => {
    const raw = JSON.stringify({
      level: 50,
      time: new Date(2026, 0, 1, 14, 22, 3).getTime(),
      pid: 100,
      hostname: "host",
      msg: "Database probe failed",
      err: { message: "ECONNREFUSED", stack: "Error: ECONNREFUSED\n    at connect" },
      attempt: 2,
    });

    expect(formatLogLine(raw)).toBe(
      "[14:22:03] ERROR Database probe failed (ECONNREFUSED) attempt=2\nError: ECONNREFUSED\n    at connect",
    );
  });

  it("returns null for blank or suppressed lines and preserves non-JSON text", () => {
    expect(formatLogLine("")).toBeNull();
    expect(formatLogLine(JSON.stringify({ level: 30, time: 1700000000000, msg: "" }))).toBeNull();
    expect(formatLogLine("plain warning line")).toBe("plain warning line");
  });

  it("streams multiple JSON lines into plain text via createPrettyLogStream", () => {
    const written: string[] = [];
    const stream = createPrettyLogStream({
      write(chunk: string | Uint8Array): boolean {
        written.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        return true;
      },
    });

    const line1 = JSON.stringify({ level: 30, time: new Date(2026, 0, 1, 8, 0, 0).getTime(), msg: "first" });
    const line2 = JSON.stringify({ level: 40, time: new Date(2026, 0, 1, 8, 0, 1).getTime(), msg: "second" });
    const emptyLine = JSON.stringify({ level: 30, time: new Date(2026, 0, 1, 8, 0, 2).getTime(), msg: "" });

    stream.write(`${line1}\n${emptyLine}\n${line2}\n`);

    expect(written).toEqual([
      "[08:00:00] INFO  first\n",
      "[08:00:01] WARN  second\n",
    ]);
  });

  it("formats startup info, warn objects, and error instances via createSimpleLogger", () => {
    const written: string[] = [];
    const logger = createSimpleLogger({
      write(chunk: string | Uint8Array): boolean {
        written.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        return true;
      },
    });

    logger.info("PostgreSQL connection established");
    logger.warn({ err: "timeout" }, "Probe slow");
    logger.error(new Error("boom"), "Startup failed");

    expect(written[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\] INFO {2}PostgreSQL connection established\n$/);
    expect(written[1]).toMatch(/^\[\d{2}:\d{2}:\d{2}\] WARN {2}Probe slow \(timeout\)\n$/);
    expect(written[2]).toMatch(/^\[\d{2}:\d{2}:\d{2}\] ERROR Startup failed \(boom\)\nError: boom/);
  });
});
