#!/usr/bin/env node
// End-to-end proof that keep-going wakes an idle Claude Code session with a pending item.
// Runs a real interactive session in tmux, so it uses a little model usage (Haiku by default).
//
//   node e2e/claude-idle-wake.ts            # needs claude, tmux, Node 22.18+
//   E2E_MODEL=sonnet node e2e/claude-idle-wake.ts
//
// Pass: the session ends its turn, sits idle, and is woken by a "keep-going:" nudge
// without anyone typing. Exit code 0 on pass, 1 on fail.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const pluginDir = resolve(import.meta.dirname, "../plugins/keep-going");
const work = mkdtempSync(join(process.env.E2E_TMP || tmpdir(), "keep-going-e2e-"));
const session = `kg-e2e-${process.pid}`;
const model = process.env.E2E_MODEL || "haiku";
const idleMinutes = 0.5;
const deadlineMs = 4 * 60_000;

function tmux(...args: string[]): string {
  return execFileSync("tmux", args, { encoding: "utf8" });
}

function trust(dir: string): void {
  // Claude asks "do you trust this folder?" for a new directory. Pre-accept it, replacing the file atomically.
  const cfgDir = process.env.CLAUDE_CONFIG_DIR;
  const path = cfgDir ? join(cfgDir, ".claude.json") : join(homedir(), ".claude.json");
  if (!existsSync(path)) return;
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  cfg.projects ??= {};
  cfg.projects[dir] = { ...(cfg.projects[dir] ?? {}), hasTrustDialogAccepted: true };
  const tmp = `${path}.kg-e2e-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  renameSync(tmp, path);
}

function pane(): string {
  return tmux("capture-pane", "-p", "-t", session, "-S", "-400");
}

async function waitFor(pred: () => boolean, ms: number, label: string): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(3000);
  }
  console.error(`timed out waiting for: ${label}`);
  return false;
}

async function main(): Promise<number> {
  execFileSync("git", ["init", "-q", work]);
  execFileSync("node", [join(pluginDir, "scripts/keep-going.ts"), "on", String(idleMinutes)], { cwd: work });
  trust(work);

  const prompt =
    "Create the file .keep-going/waiting.md containing exactly this one line: " +
    "- [ ] fake deploy | check: test -f done.flag  . Then reply with the single word WAITING and end your turn. " +
    "If you are later woken by a keep-going message, run the check, and reply WOKEN plus the check result.";
  const cmd = [
    "claude",
    "--plugin-dir", pluginDir,
    "--model", model,
    "--permission-mode", "bypassPermissions",
    JSON.stringify(prompt),
  ].join(" ");
  tmux("new-session", "-d", "-s", session, "-x", "200", "-y", "50", "-c", work,
    `KEEP_GOING_POLL_SECONDS=5 ${cmd}`);

  try {
    const wrote = await waitFor(() => existsSync(join(work, ".keep-going/waiting.md")), 90_000, "pending item written");
    if (!wrote) return fail("agent never wrote the pending item");
    // The prompt itself is echoed in the pane, so match only text the agent or the hook produces.
    const stopped = await waitFor(() => /^\s*●?\s*WAITING\s*$/m.test(pane()), 60_000, "first turn ended");
    if (!stopped) return fail("first turn never ended");
    const t0 = Date.now();
    console.log("turn ended; now idle, nobody types");
    const woke = await waitFor(() => /has been idle/.test(pane()) || /has been idle/.test(transcripts()), deadlineMs, "idle wake");
    if (!woke) return fail("session was not woken");
    console.log(`PASS: woken ${Math.round((Date.now() - t0) / 1000)}s after going idle (idle period ${idleMinutes * 60}s)`);
    return 0;
  } finally {
    if (process.env.E2E_KEEP !== "1") {
      try { tmux("kill-session", "-t", session); } catch { /* already gone */ }
    } else {
      console.log(`left running: tmux attach -t ${session}  (dir ${work})`);
    }
  }
}

function transcripts(): string {
  // Claude stores the session transcript under its projects folder, keyed by the working directory.
  const base = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects", work.replace(/[^A-Za-z0-9]/g, "-"));
  try {
    return readdirSync(base).filter((f) => f.endsWith(".jsonl")).map((f) => readFileSync(join(base, f), "utf8")).join("\n");
  } catch {
    return "";
  }
}

function fail(why: string): number {
  console.error(`FAIL: ${why}\n--- pane ---\n${pane()}`);
  return 1;
}

process.exitCode = await main();
