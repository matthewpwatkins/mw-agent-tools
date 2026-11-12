import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  afterNudge,
  lastAssistantText,
  check,
  openItems,
  readConfig,
  soundsLikeWaiting,
  waitMinutes,
  writeConfig,
} from "../scripts/lib.ts";

test("openItems keeps only unchecked task lines", () => {
  const md = "# waiting\n- [ ] deploy api | check: x\n- [x] done thing\n* [ ] helper lane\n- [ ]\nplain line\n";
  assert.deepEqual(openItems(md), ["deploy api | check: x", "helper lane"]);
});

test("check passes when items are written down", () => {
  const r = check({ background_tasks: [{ id: "1", status: "running" }] }, "- [ ] build | check: y");
  assert.equal(r.block, false);
});

test("check blocks when background work runs but nothing is listed", () => {
  const r = check({ background_tasks: [{ id: "1", status: "running" }] }, "");
  assert.equal(r.block, true);
  assert.match(r.block ? r.reason : "", /background task/);
});

test("check blocks when the last message says it is waiting", () => {
  const r = check({ last_assistant_message: "Deploy kicked off, waiting on CI before the next step." }, "");
  assert.equal(r.block, true);
});

test("check never blocks twice in a row", () => {
  const r = check({ stop_hook_active: true, background_tasks: [{ id: "1", status: "running" }] }, "");
  assert.equal(r.block, false);
});

test("check stays quiet when nothing is pending", () => {
  assert.equal(check({ last_assistant_message: "All done, PR is open." }, "").block, false);
  assert.equal(check({ background_tasks: [{ id: "1", status: "completed" }] }, "").block, false);
});

test("soundsLikeWaiting", () => {
  assert.ok(soundsLikeWaiting("I'll check back once the deploy finishes"));
  assert.ok(soundsLikeWaiting("Tests still running"));
  assert.ok(!soundsLikeWaiting("Merged and verified."));
  assert.ok(!soundsLikeWaiting(undefined));
});

test("backoff doubles while the list is unchanged, capped at 8x, resets on change", () => {
  const cfg = { enabled: true, idleMinutes: 10, maxWaitMinutes: 999 };
  assert.equal(waitMinutes(cfg, {}, "a"), 10);
  let s = afterNudge({}, "a");
  assert.equal(waitMinutes(cfg, s, "a"), 20);
  s = afterNudge(s, "a");
  assert.equal(waitMinutes(cfg, s, "a"), 40);
  s = afterNudge(afterNudge(s, "a"), "a");
  assert.equal(waitMinutes(cfg, s, "a"), 80);
  assert.equal(waitMinutes(cfg, s, "b"), 10);
});

test("no wait ever exceeds the ceiling, so a session that parks after an hour idle is nudged first", () => {
  const cfg = { enabled: true, idleMinutes: 15, maxWaitMinutes: 45 };
  let s = {};
  for (let i = 0; i < 6; i++) {
    assert.ok(waitMinutes(cfg, s, "a") <= 45);
    s = afterNudge(s, "a");
  }
  assert.equal(waitMinutes({ ...cfg, idleMinutes: 120 }, {}, "a"), 45);
});

test("config is off by default, on after writeConfig, env overrides minutes", () => {
  const dir = mkdtempSync(join(tmpdir(), "kg-"));
  assert.deepEqual(readConfig(dir, {}), { enabled: false, idleMinutes: 15, maxWaitMinutes: 45 });
  writeConfig(dir, { enabled: true, idleMinutes: 30, maxWaitMinutes: 50 });
  assert.deepEqual(readConfig(dir, {}), { enabled: true, idleMinutes: 30, maxWaitMinutes: 50 });
  assert.equal(readConfig(dir, { KEEP_GOING_IDLE_MINUTES: "5" }).idleMinutes, 5);
});

test("lastAssistantText reads Claude and Copilot transcripts", () => {
  const claude = [
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "first" }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use" }, { type: "text", text: "waiting on CI" }] } }),
    JSON.stringify({ type: "user", message: { content: "x" } }),
  ].join("\n");
  assert.equal(lastAssistantText(claude), "waiting on CI");
  const copilot = [
    JSON.stringify({ type: "assistant.message", data: { content: "OK" } }),
    JSON.stringify({ type: "assistant.turn_end", data: {} }),
  ].join("\n");
  assert.equal(lastAssistantText(copilot), "OK");
  assert.equal(lastAssistantText("not json\n"), undefined);
});
