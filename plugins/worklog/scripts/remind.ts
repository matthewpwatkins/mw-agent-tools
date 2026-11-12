#!/usr/bin/env node
// Session start: if this project keeps a work log, remind the agent to keep it current.
// Prints nothing (and so adds nothing to the conversation) when there is no log.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function reminder(cwd: string): string | null {
  const path = join(cwd, ".worklog", "worklog.md");
  if (!existsSync(path)) return null;
  const now = readFileSync(path, "utf8").split(/^## Log/m)[0].trim();
  return (
    "This project keeps a work log at .worklog/worklog.md (see the worklog skill). " +
    "Keep it current as you go: log milestones, decisions, status changes and blockers, and rewrite its Now section on each update.\n\n" +
    `Current state from the log:\n${now}`
  );
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  let cwd = process.cwd();
  if (!process.stdin.isTTY) {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    try {
      cwd = JSON.parse(raw || "{}").cwd || cwd;
    } catch {
      /* keep process cwd */
    }
  }
  const text = reminder(cwd);
  if (text) {
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }) + "\n",
    );
  }
}
