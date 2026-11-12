# mw-agent-tools

Tools that keep coding agents working while you are away. Claude Code plugin first, built to install in other agents too.

| Tool | What it does |
|---|---|
| **keep-going** | Wakes an idle session when work is still pending (deploys, pipelines, helper sessions), and makes the agent write down what it waits on before it goes quiet. Costs no model usage while nothing is pending. |
| **autonomy** | For when you step away for hours or a day: gathers every sign-in, approval and decision up front, turns on keep-going and the work log, then works on best judgement and logs each call with its reason and undo path. |
| **worklog** | Keeps a running log of milestones, decisions and status, with a "Now" table that is always current, so you can see where things stand at any time. |
| **digest** | One-screen catch-up when you return: work items with status and progress, then what happened since your last message. Reads the work log and decision log. |

## Install

| Agent | Install |
|---|---|
| Claude Code | `/plugin marketplace add matthewpwatkins/mw-agent-tools` then `/plugin install keep-going@mw-agent-tools` (and `autonomy`, `worklog`, `digest`) |
| GitHub Copilot CLI | `copilot plugin marketplace add matthewpwatkins/mw-agent-tools` then `copilot plugin install keep-going@mw-agent-tools` |
| Codex | `codex plugin marketplace add matthewpwatkins/mw-agent-tools`, then install from `/plugins` |
| Cursor | Add the repository as a plugin marketplace, then install the plugins |
| OpenCode, and any agent that reads Agent Skills | Copy `plugins/<tool>/skills/<tool>` into `.agents/skills/` (project) or `~/.agents/skills/` (personal) |

Hook scripts need Node 22.18 or later.

## What works where

| | Claude Code | Copilot CLI | Codex | Cursor | Skills only |
|---|---|---|---|---|---|
| Skills (all four tools) | ✅ | ✅ | ✅ | ✅ | ✅ |
| keep-going: write down what you wait on, checked at every stop | ✅ | ✅ tested | ✅ untested | ✅ untested | instructions only |
| keep-going: wake an idle session | ✅ tested | | | | |
| worklog: reminder with the current state at session start | ✅ | ✅ untested | ✅ untested | | |

The idle wake relies on Claude Code's background hooks, which can wake a session that has finished its turn. The other agents' stop hooks can only continue a turn immediately, not after a delay, so there they get the write-it-down check without the timer.

## keep-going in short

```
/keep-going 20        on, nudge after 20 minutes idle
/keep-going status    what is pending
/keep-going off
```

While on, the agent keeps `.keep-going/waiting.md` listing what it waits on (`- [ ] deploy api | check: <command>`). When a turn ends:

1. If work looks pending but nothing is listed, the agent is sent back once to write it down.
2. A background watcher waits out the idle period. Anything happening in the session cancels it. If nothing is listed, it exits at once.
3. If the session is still idle with items listed, it is woken with the list and told to check each one and carry on.

Repeated nudges with an unchanged list back off (2x, 4x, 8x), and no wait exceeds 45 minutes, so a host that stops idle sessions after an hour never stops one with work pending. Set `idleMinutes` and `maxWaitMinutes` in `.keep-going/config.json`.

## Layout

One source of truth, thin per-agent adapters:

```
catalog.json                     plugin list, versions, descriptions: edit this
scripts/sync-manifests.ts        writes every manifest below from it (npm run sync)
.claude-plugin/marketplace.json  Claude Code (Copilot CLI reads it too)
.agents/plugins/marketplace.json Codex
.cursor-plugin/marketplace.json  Cursor
plugins/<tool>/
  skills/<tool>/SKILL.md         the tool itself, in the shared Agent Skills format
  scripts/                       hook scripts (TypeScript, run directly by Node)
  hooks/hooks.json               Claude Code hooks
  hooks/{codex,copilot,cursor}.json  each agent's own hooks file
  .claude-plugin/ .codex-plugin/ .cursor-plugin/ .github/plugin/   generated manifests
```

## Develop

```
npm test           unit tests, manifest drift check, repo hygiene check
npm run sync       regenerate manifests after editing catalog.json
npm run e2e        real Claude Code session in tmux: idles with a pending item and must be woken (uses a little model usage)
```

## License

MIT
