import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { reminder } from "../scripts/remind.ts";

test("no log, no reminder", () => {
  assert.equal(reminder(mkdtempSync(join(tmpdir(), "wl-"))), null);
});

test("reminder carries the Now section but not the whole log", () => {
  const dir = mkdtempSync(join(tmpdir(), "wl-"));
  mkdirSync(join(dir, ".worklog"));
  writeFileSync(
    join(dir, ".worklog", "worklog.md"),
    "# Work log\n\n## Now\n| Item | Status |\n|---|---|\n| Ship it | waiting |\n\n## Log\n- old line that should not appear\n",
  );
  const r = reminder(dir) ?? "";
  assert.match(r, /Ship it \| waiting/);
  assert.doesNotMatch(r, /old line/);
});
