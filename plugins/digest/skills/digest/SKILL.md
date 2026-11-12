---
name: digest
description: One-screen digest for a human who stepped away and is back. Work items with status and progress, then what happened since their last message, decisions made on their behalf, and anything that needs them. Use when the human says "digest", "catch me up", "what happened", "I'm back", or returns after a long gap.
argument-hint: "[optional focus, e.g. 'billing only']"
---

# digest

Focus, if given: `$ARGUMENTS`

The human stepped away, possibly all night, and is back. Give them one screen they can read in under a minute. Terse, plain words, the effect not the mechanics. Every time carries a zone label, in the human's local zone when you know it.

## 1. Find "since"

"Since" is the human's last message that they typed themselves. These are **not** theirs: messages from other agents or sessions, scheduled or looped prompts, keep-going nudges, system reminders, hook output, task notifications. Note its time.

If this session's context does not reach back that far (a restart, a compaction), say so in one line and rebuild from durable sources:

| Source | What it gives |
|---|---|
| `.worklog/worklog.md` | the "Now" table and the log since "since" |
| `.autonomy/decisions.md` | decisions made on their behalf |
| `.keep-going/waiting.md` | what is still in flight |
| `git log`, pull requests, pipeline runs | what actually landed |
| other agent sessions you can list or message | their state |

## 2. Verify before you report

Do not report a state from memory, a log line or another agent's message alone when a cheap check exists. Re-check what is still live: pull request state, pipeline runs, helper sessions alive and busy, sign-ins something waits on (an actual call, not a cached status). If a check fails or you could not run it, mark that item "unverified".

## 3. Work items

One row per work item: the outcomes the human cares about, not every pull request. Group related changes under one item. Order by status: done first, then in progress, pending, blocked, needs-you, and failed last.

Exactly this markdown table:

```
| | % | Item | Note |
|---|---|---|---|
| <emoji> | `<bar>` | <title> | <note, or empty> |
```

| Emoji | Meaning |
|---|---|
| 🙋 | Needs the human (a decision, a sign-in, a check in a browser) |
| ⛔ | Blocked on something other than the human |
| 🔄 | In progress |
| ⏳ | Pending, not started or queued |
| ✅ | Done and verified |
| ❌ | Failed or abandoned |

Bar: 5 cells of `█` and `░` in backticks, your honest estimate of how far the item is from done (done is all `█`). Title under 60 characters. Note: one terse phrase, only when it changes what they do or know: the exact command they must run, a risk, a decision made for them, or "unverified". Empty for routine done items.

## 4. Since you left

Then a heading `Since you left (<since time> to <now>, <zone>)` and:

- What changed for the system, in order, with times. Merge noise: "4 PRs merged, all green" beats four lines.
- Decisions made on their behalf, each with a one-line reason, so they can overrule them (from the decision log when there is one).
- Anything that broke or went down, for how long, and whether it is fixed.
- Anything said outside this machine in their name (chat messages, pull request comments): what and where.

Under 150 words; use a table if items share a shape. End there: no recap, no offer.
