#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const goDir = path.join(repoRoot, "backend", "fiber");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const runE2E = process.argv.includes("--e2e");

function runStep(label, command, args, cwd = repoRoot, extraEnv = {}) {
  console.log(`\n=== [verify:all] ${label} ===`);
  const useCmdShim = process.platform === "win32" && command.endsWith(".cmd");
  const actualCmd = useCmdShim ? process.env.ComSpec || "cmd.exe" : command;
  const actualArgs = useCmdShim ? ["/d", "/c", command, ...args] : args;

  const result = spawnSync(actualCmd, actualArgs, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (result.error) {
    console.error(`Failed to spawn ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n[verify:all] FAILED at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function checkGoFmt() {
  console.log("\n=== [verify:all] Go formatting check (gofmt -l .) ===");
  const output = execFileSync("gofmt", ["-l", "."], { cwd: goDir, encoding: "utf8" }).trim();
  if (output.length > 0) {
    console.error("Unformatted Go files found:\n" + output);
    process.exit(1);
  }
  console.log("gofmt clean.");
}

function hasCCompiler() {
  const compiler = process.env.CC || "gcc";
  const check = spawnSync(compiler, ["--version"], { stdio: "ignore" });
  return check.status === 0;
}

// 1. Fastify workspace
const prismaValidateEnv = {
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql://velostream:velostream_dev_password@localhost:5432/velostream?schema=public",
};
runStep(
  "fastify prisma validate",
  npmCmd,
  ["run", "prisma:validate", "-w", "@velostream/fastify"],
  repoRoot,
  prismaValidateEnv,
);
runStep(
  "fastify prisma generate",
  npmCmd,
  ["run", "prisma:generate", "-w", "@velostream/fastify"],
  repoRoot,
  prismaValidateEnv,
);
runStep("fastify typecheck", npmCmd, ["run", "typecheck", "-w", "@velostream/fastify"]);
runStep("fastify lint", npmCmd, ["run", "lint", "-w", "@velostream/fastify"]);
runStep("fastify test", npmCmd, ["run", "test", "-w", "@velostream/fastify"]);
runStep("fastify build", npmCmd, ["run", "build", "-w", "@velostream/fastify"]);

// 2. Go Fiber Service
checkGoFmt();
runStep("fiber go vet", "go", ["vet", "./..."], goDir);
if (hasCCompiler()) {
  runStep(
    "fiber go test -race",
    "go",
    ["test", "-race", "-count=1", "./..."],
    goDir,
    { CGO_ENABLED: "1" },
  );
} else {
  console.warn(
    "\n[verify:all] WARN: C compiler (gcc) not found in PATH; running Go tests without -race. Install MinGW-w64 gcc or run on Linux/CI for -race.",
  );
  runStep("fiber go test", "go", ["test", "-count=1", "./..."], goDir);
}
runStep("fiber go build", "go", ["build", "./..."], goDir);

// 3. Frontend workspace
runStep("frontend typecheck", npmCmd, ["run", "typecheck", "-w", "@velostream/frontend"]);
runStep("frontend lint", npmCmd, ["run", "lint", "-w", "@velostream/frontend"]);
runStep("frontend test", npmCmd, ["run", "test", "-w", "@velostream/frontend"]);
runStep("frontend build", npmCmd, ["run", "build", "-w", "@velostream/frontend"]);

// 4. Infrastructure Compose validation
runStep("docker compose config validation", "docker", ["compose", "config", "-q"]);

if (runE2E) {
  runStep("frontend Playwright E2E", npxCmd, ["playwright", "test"], path.join(repoRoot, "frontend"));
}

console.log("\n=== [verify:all] ALL CHECKS PASSED ===");
