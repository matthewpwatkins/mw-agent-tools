import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const catalog = JSON.parse(readFileSync(join(root, "catalog.json"), "utf8"));

test("generated manifests match catalog.json", () => {
  execFileSync("node", [join(root, "scripts/sync-manifests.ts"), "--check"], { stdio: "pipe" });
});

test("every plugin has a skill and every hooks file it names exists", () => {
  for (const p of catalog.plugins) {
    const dir = join(root, "plugins", p.name);
    assert.ok(existsSync(join(dir, "skills", p.name, "SKILL.md")), `${p.name} skill`);
    for (const path of Object.values(p.hooks ?? {}) as string[]) assert.ok(existsSync(join(dir, path)), `${p.name} ${path}`);
  }
});

test("skills carry name and description frontmatter matching their folder", () => {
  for (const p of catalog.plugins) {
    const md = readFileSync(join(root, "plugins", p.name, "skills", p.name, "SKILL.md"), "utf8");
    const fm = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    assert.match(fm, new RegExp(`^name: ${p.name}$`, "m"));
    assert.match(fm, /^description: .{20,}/m);
  }
});

test("nothing employer-specific or secret in the repo", () => {
  const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.endsWith("manifests.test.ts"));
  const banned = /familysearch|ws-atb|\batb-|fs-box|aoe |ldsmobile|ghp_[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}/i;
  for (const f of files) {
    const text = readFileSync(join(root, f), "utf8");
    assert.doesNotMatch(text, banned, f);
  }
});
