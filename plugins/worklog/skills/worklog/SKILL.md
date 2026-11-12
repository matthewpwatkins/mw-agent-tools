---
name: worklog
description: Keep a running work log of milestones, decisions and status in .worklog/worklog.md, so a human returning at any time gets a one-screen view of where things stand. Use when the human says "keep a log", "log as you go", "worklog", or is about to step away from long-running work. Also use to read the log back.
argument-hint: "[on | show]"
---

# worklog

Arguments: `$ARGUMENTS` (`on` or empty: start or keep logging; `show`: print the "Now" section and the last ten log lines).

The log lives at `.worklog/worklog.md` in the project folder. Create it if missing, from the shape below. Suggest adding `.worklog/` to `.gitignore` unless the human wants it committed.

## Shape

```markdown
# Work log

## Now
<!-- Rewritten on every update. One row per work item. -->
| Item | Status | Next | Needs human |
|---|---|---|---|
| Ship search filter | in progress | waiting on CI run 4812 | |
| Migrate users table | blocked | needs prod sign-in | yes: sign in to the cloud console |

## Log
<!-- Append only, oldest first. One line each. -->
- 2026-11-12 14:05 CST · milestone · Search filter PR opened (#41)
- 2026-11-12 14:20 CST · decision · Used the existing date picker instead of adding a library. Undo: revert a1b2c3
```

## Rules

1. **Write as you go, not at the end.** Add a log line the moment one of these happens:

   | Kind | When |
   |---|---|
   | milestone | something is done and verified: PR opened or merged, deploy green, test suite passing |
   | decision | you chose between real options; give the reason, and the undo path if it is not obvious |
   | status | you start, park or hand off an item, or start waiting on something |
   | blocker | something stops an item; say what would unblock it |
   | broke | something failed or went down; say whether it is fixed |

2. **Rewrite "Now" on every update** so it is always the current truth: every live item, its status (`done`, `in progress`, `waiting`, `blocked`, `needs human`), the next step, and whether it needs the human. Drop items that were done before the previous update.
3. **Times carry a zone label** (`14:05 CST`, `09:30 UTC`), in the human's local zone when you know it.
4. **One line per entry, plain words, the effect not the mechanics.** "Login page loads in 1s, was 4s" beats "memoized the session lookup".
5. **Never log secrets**: no tokens, passwords, keys or private URLs.
6. Before ending a turn, make sure "Now" matches reality. A human may read it at any moment.
