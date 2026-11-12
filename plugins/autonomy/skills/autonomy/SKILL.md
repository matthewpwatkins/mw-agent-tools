---
name: autonomy
description: The human is stepping away for hours or a day. Collect every human-only need now (sign-ins, approvals, decisions), then keep working on best judgement without waiting, logging each decision with its reason and undo path for later review. Turns on keep-going and the work log. Use when the human says "I'm stepping away", "going to bed", "work on this overnight", "run autonomously", "back tomorrow", or gives a time they will be gone.
argument-hint: "[how long you will be away, e.g. 8h]"
---

# autonomy

The human is leaving for `$ARGUMENTS` (if empty, assume several hours). From the moment they go until they come back, nobody will answer a question. Plan for that.

## 1. Before they go: collect every human-only need, in one message

Walk the remaining work end to end, in your head, and list everything only the human can do. Typical:

| Kind | Examples |
|---|---|
| Sign-ins | cloud console, package registry, single sign-on sessions that will expire overnight |
| Approvals | merging to a protected branch, deploying to production, spending money, messaging other people |
| Decisions | a choice between real options where their preference matters, scope cuts, naming |
| Access | a token, a permission, a file only they have |

Ask for all of them **in one message**, as a numbered table: what you need, why, and what you will do if they do not answer (your default). Make each answerable with a word. Do not ask about anything you can decide yourself.

When they answer (or say "go"), treat unanswered items as "use your default". Write the answers down in the decision log (below) so they survive a restart.

## 2. Turn on the helpers

- **keep-going**, with an idle period that fits the work (15 to 30 minutes for pipelines and deploys). If it is installed, run its skill; it wakes this session if it goes quiet with work still pending.
- **worklog**: start or update `.worklog/worklog.md` so the human gets a one-screen view when they return.
- If the agent can schedule its own wake-ups, schedule a check-in for anything with a known finish time.

## 3. While they are away

- **Never stop to ask.** When you hit a question, make the call a careful senior engineer would make, log it, and carry on. If the choice is irreversible or outward-facing and was not pre-approved, do not do it: park that item, mark it "needs human" in the work log, and move to the next thing.
- **Stay inside what was approved.** No force-pushes, no deleting data, no production changes, no messages to other people, no spending, unless the human approved exactly that in step 1.
- **Prefer reversible moves**: branches over direct commits, drafts over posts, feature flags over removals.
- **Do not idle.** If one item is blocked, switch to another. Before ending any turn that waits on something, list it for keep-going.
- **Verify before claiming done**: run the tests, check the pipeline, read the result.

## 4. Decision log

Append every judgement call to `.autonomy/decisions.md` (create it; suggest ignoring `.autonomy/` in git):

```markdown
| When | Decision | Why | Undo |
|---|---|---|---|
| 2026-11-12 23:10 CST | Kept the old cache key format | New format would invalidate every cached page at once | Change KEY_VERSION back to 2 in config, redeploy |
```

One row per decision, plain words. The undo column must be something the human can actually do, not "revert". Also add a one-line `decision` entry to the work log.

## 5. When they come back

Lead with what needs them, then what you decided for them (link the decision log), then what got done. If a digest skill is installed, run it.
