#!/usr/bin/env node
// keep-going CLI. Hooks call `check` (fast, at every stop) and `watch` (background, wakes an idle session).
// Usage: node keep-going.ts <on [minutes] | off | status | check [--format cursor] | watch>
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  afterNudge,
  check,
  DIR,
  hashItems,
  mtimeMs,
  nudgeMessage,
  openItems,
  readConfig,
  readWaiting,
  type StopInput,
  waitMinutes,
  type WatchState,
  writeConfig,
} from "./lib.ts";

async function readStdin(): Promise<StopInput> {
  if (process.stdin.isTTY) return {};
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function stateDir(cwd: string): string {
  const base = process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA || join(cwd, DIR, "state");
  mkdirSync(base, { recursive: true });
  return base;
}

function statePath(cwd: string, session: string): string {
  return join(stateDir(cwd), `watch-${session.replace(/[^\w-]/g, "_")}.json`);
}

function loadState(path: string): WatchState {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  } catch {
    return {};
  }
}

function saveState(path: string, s: WatchState): void {
  writeFileSync(path, JSON.stringify(s));
}

async function runCheck(format: string): Promise<number> {
  const input = await readStdin();
  const cwd = input.cwd || process.cwd();
  if (!readConfig(cwd).enabled) return 0;
  const r = check(input, readWaiting(cwd));
  if (!r.block) return 0;
  const out = format === "cursor" ? { followup_message: r.reason } : { decision: "block", reason: r.reason };
  process.stdout.write(JSON.stringify(out) + "\n");
  return 0;
}

async function runWatch(): Promise<number> {
  const input = await readStdin();
  const cwd = input.cwd || process.cwd();
  const cfg = readConfig(cwd);
  // Nothing pending means nothing to wake for: exit at once, costing no model usage.
  const pending = openItems(readWaiting(cwd));
  if (!cfg.enabled || pending.length === 0) return 0;

  const path = statePath(cwd, input.session_id || "default");
  const token = randomUUID();
  const state = { ...loadState(path), token };
  saveState(path, state);

  const pollMs = Number(process.env.KEEP_GOING_POLL_SECONDS || 15) * 1000;
  await sleep(Math.min(pollMs, 2000)); // let the transcript settle after the stop
  const baseline = mtimeMs(input.transcript_path);
  const waitMs = waitMinutes(cfg, state, hashItems(pending)) * 60_000;
  const started = Date.now();

  while (Date.now() - started < waitMs) {
    await sleep(Math.min(pollMs, waitMs - (Date.now() - started)));
    if (loadState(path).token !== token) return 0; // a newer stop owns the watch
    if (mtimeMs(input.transcript_path) > baseline) return 0; // the session moved on by itself
  }

  const items = openItems(readWaiting(cwd));
  if (items.length === 0) return 0;
  saveState(path, afterNudge(loadState(path), hashItems(items)));
  process.stderr.write(nudgeMessage(items, waitMs / 60_000) + "\n");
  return 2; // exit 2 from an asyncRewake hook wakes the session with this message
}

function runOn(arg: string | undefined): number {
  const cwd = process.cwd();
  const minutes = Number(arg ?? readConfig(cwd).idleMinutes);
  writeConfig(cwd, { ...readConfig(cwd), enabled: true, idleMinutes: minutes > 0 ? minutes : 15 });
  return runStatus();
}

function runOff(): number {
  const cwd = process.cwd();
  writeConfig(cwd, { ...readConfig(cwd), enabled: false });
  return runStatus();
}

function runStatus(): number {
  const cwd = process.cwd();
  const cfg = readConfig(cwd);
  const items = openItems(readWaiting(cwd));
  console.log(
    `keep-going ${cfg.enabled ? "on" : "off"}, nudge after ${cfg.idleMinutes} min idle (never waits over ${cfg.maxWaitMinutes} min), ${items.length} pending item(s)` +
      (items.length ? ":\n" + items.map((i) => `- ${i}`).join("\n") : ""),
  );
  return 0;
}

const [cmd, ...rest] = process.argv.slice(2);
const fmt = rest[rest.indexOf("--format") + 1] ?? "";
const run: Record<string, () => number | Promise<number>> = {
  check: () => runCheck(rest.includes("--format") ? fmt : ""),
  watch: runWatch,
  on: () => runOn(rest[0]),
  off: runOff,
  status: runStatus,
};
if (!cmd || !run[cmd]) {
  console.error("usage: keep-going.ts <on [minutes] | off | status | check [--format cursor] | watch>");
  process.exit(1);
}
process.exitCode = await run[cmd]();
