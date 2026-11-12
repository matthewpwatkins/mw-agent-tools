// Shared logic for keep-going. Pure functions here; I/O lives in keep-going.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DIR = ".keep-going";
export const WAITING_FILE = "waiting.md";
export const CONFIG_FILE = "config.json";

export interface Config {
  enabled: boolean;
  idleMinutes: number;
  // Ceiling on any single wait, backoff included. Keep it under whatever stops an idle session
  // (some hosts park a session after an hour idle, and a parked session cannot be woken from inside).
  maxWaitMinutes: number;
}

export interface StopInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
  background_tasks?: { id: string; type?: string; status?: string; description?: string }[];
}

export interface WatchState {
  token?: string;
  // How many nudges in a row found the waiting list unchanged. Drives backoff.
  unchanged?: number;
  lastHash?: string;
}

const DEFAULT_IDLE_MINUTES = 15;
const DEFAULT_MAX_WAIT_MINUTES = 45;
const MAX_BACKOFF_STEPS = 3; // idle, 2x, 4x, 8x

export function readConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): Config {
  let cfg: Partial<Config> = {};
  const path = join(cwd, DIR, CONFIG_FILE);
  if (existsSync(path)) {
    try {
      cfg = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      cfg = {};
    }
  }
  const envIdle = Number(env.KEEP_GOING_IDLE_MINUTES);
  const idle = Number.isFinite(envIdle) && envIdle > 0 ? envIdle : Number(cfg.idleMinutes);
  const max = Number(env.KEEP_GOING_MAX_WAIT_MINUTES ?? cfg.maxWaitMinutes);
  return {
    enabled: env.KEEP_GOING === "1" || cfg.enabled === true,
    idleMinutes: Number.isFinite(idle) && idle > 0 ? idle : DEFAULT_IDLE_MINUTES,
    maxWaitMinutes: Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX_WAIT_MINUTES,
  };
}

export function writeConfig(cwd: string, cfg: Config): void {
  mkdirSync(join(cwd, DIR), { recursive: true });
  writeFileSync(join(cwd, DIR, CONFIG_FILE), JSON.stringify(cfg, null, 2) + "\n");
}

/** Open items are unchecked markdown task lines: "- [ ] ...". */
export function openItems(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((l) => /^\s*[-*] \[ \]\s+\S/.test(l))
    .map((l) => l.replace(/^\s*[-*] \[ \]\s+/, "").trim());
}

export function readWaiting(cwd: string): string {
  const path = join(cwd, DIR, WAITING_FILE);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function hashItems(items: string[]): string {
  return createHash("sha256").update(items.join("\n")).digest("hex").slice(0, 16);
}

// Phrases that mean "I am ending my turn but something is still in flight".
const WAITING_PHRASES =
  /\b(waiting (for|on)|wait for|once (it|they|the \w+) (finish|finishes|complete|completes|land|lands|pass|passes)|will check (back|again)|check back|still running|in progress|in flight|when .{1,40} (finishes|completes|lands))\b/i;

export function soundsLikeWaiting(message: string | undefined): boolean {
  return !!message && WAITING_PHRASES.test(message);
}

/**
 * Last thing the agent said, for agents whose stop input leaves it out. Reads the transcript
 * (one JSON event per line) and understands Claude ("assistant" with text parts) and Copilot
 * ("assistant.message" with content). Returns undefined when it cannot tell.
 */
export function lastAssistantText(jsonl: string): string | undefined {
  const lines = jsonl.trimEnd().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let e: any;
    try {
      e = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (e?.type === "assistant.message" && typeof e.data?.content === "string" && e.data.content.trim()) {
      return e.data.content;
    }
    if (e?.type === "assistant" && Array.isArray(e.message?.content)) {
      const text = e.message.content.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n");
      if (text.trim()) return text;
    }
  }
  return undefined;
}

export type CheckResult = { block: false } | { block: true; reason: string };

/**
 * Stop-time check. Blocks only when work looks pending but nothing is written down,
 * so the agent records what it waits on before it goes quiet. Never blocks twice in a row.
 */
export function check(input: StopInput, waitingMarkdown: string): CheckResult {
  if (input.stop_hook_active) return { block: false };
  if (openItems(waitingMarkdown).length > 0) return { block: false };
  const running = (input.background_tasks ?? []).filter((t) => t.status !== "completed");
  const why =
    running.length > 0
      ? `${running.length} background task(s) are still running`
      : soundsLikeWaiting(input.last_assistant_message)
        ? "your last message says you are waiting on something"
        : null;
  if (!why) return { block: false };
  return {
    block: true,
    reason:
      `keep-going: ${why}, but ${DIR}/${WAITING_FILE} lists nothing. ` +
      `Before ending your turn, add one line per thing you are waiting on, as "- [ ] <what> | check: <how to check it>". ` +
      `If nothing is actually pending, say so and end your turn.`,
  };
}

/**
 * Minutes to stay quiet before nudging. Doubles for each earlier nudge that left the list unchanged,
 * so a stuck item costs one turn per idle period at first, then fewer.
 */
export function waitMinutes(cfg: Config, state: WatchState, currentHash: string): number {
  const steps = state.lastHash === currentHash ? Math.min((state.unchanged ?? 0) + 1, MAX_BACKOFF_STEPS) : 0;
  return Math.min(cfg.idleMinutes * 2 ** steps, cfg.maxWaitMinutes);
}

export function nudgeMessage(items: string[], idleMinutes: number): string {
  const list = items.map((i) => `- ${i}`).join("\n");
  return (
    `keep-going: this session has been idle ${Math.round(idleMinutes)} min with work still pending:\n${list}\n` +
    `Check each item (background tasks, pipelines, deploys, helper sessions). Act on whatever finished, ` +
    `tick or remove done items in ${DIR}/${WAITING_FILE}, and carry on with the next step. ` +
    `If something needs the human, say so plainly and leave it listed.`
  );
}

/** State after a nudge: count consecutive nudges that found the same list. */
export function afterNudge(state: WatchState, hash: string): WatchState {
  return { ...state, unchanged: state.lastHash === hash ? (state.unchanged ?? 0) + 1 : 0, lastHash: hash };
}

export function mtimeMs(path: string | undefined): number {
  if (!path) return 0;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}
