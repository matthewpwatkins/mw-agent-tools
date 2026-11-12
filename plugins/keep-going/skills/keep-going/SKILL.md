---
name: keep-going
description: Stop the agent stalling while work is pending. Turns on an idle nudge that wakes the session when it has sat quiet with background tasks, pipelines, deploys or helper sessions still in flight, and makes the agent write down what it is waiting on before it ends a turn. Use when the human says "keep going", "don't stall", "watch this overnight", or sets an idle period such as "keep going 20m".
argument-hint: "[minutes | off | status]"
---

# keep-going

Arguments: `$ARGUMENTS` (a number of idle minutes, `off`, or `status`; empty means on with the current setting).

## 1. Switch it

The helper script sits two folders above this file, at `scripts/keep-going.ts` in the plugin root. Run it with Node 22.18 or later from the project folder:

| Argument | Run |
|---|---|
| empty or a number | `node <plugin root>/scripts/keep-going.ts on <minutes>` |
| `off` | `node <plugin root>/scripts/keep-going.ts off` |
| `status` | `node <plugin root>/scripts/keep-going.ts status` |

Report the one line it prints. Suggest adding `.keep-going/` to `.gitignore` if it is not ignored.

## 2. The rule while it is on

**Never end a turn with work in flight without writing it down.** Before you stop, make `.keep-going/waiting.md` list every open thing you are waiting on, one line each:

```markdown
- [ ] Deploy of api to staging | check: gh run view 1234 --json status,conclusion
- [ ] Helper session "db-migrate" finishing the schema change | check: ask it, or read its log
```

- Tick (`- [x]`) or delete a line the moment it is resolved. An empty list means "nothing pending", and the session is left alone at no cost.
- Each line says what, and how to check it, so a woken session can act without re-deriving context.
- If your agent can schedule its own wake-up (for example a loop or a scheduled wake), set one too. The idle nudge is the safety net, not the plan.

## 3. When you are nudged

A message starting `keep-going:` means the session sat idle with items still listed. Then:

1. Check each listed item with its check command.
2. Act on what finished: next step, fix, retry, or report.
3. Update the list. Leave an item listed only if it is still genuinely in flight.
4. If an item needs the human (a sign-in, an approval), say so plainly in one line, leave it listed, and carry on with anything it does not block.

Nudges back off (idle period, then twice, four times, eight times as long) while the list stays unchanged, so a stuck item does not burn usage. No single wait exceeds 45 minutes (set `maxWaitMinutes` in `.keep-going/config.json`), so a host that stops sessions after an hour idle never stops one with work pending.
