import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const FINDER = join(root, "scripts/node.sh");

// A sandbox home with a PATH holding only the shell tools the finder uses, so no real Node is on it.
function sandbox() {
  const home = mkdtempSync(join(tmpdir(), "node-finder-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  for (const tool of ["sh", "sort", "mkdir", "rm"]) {
    const real = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
    symlinkSync(real, join(bin, tool));
  }
  return { home, bin };
}

// A stand-in Node that reports a version and otherwise prints which one ran.
function fakeNode(path: string, version: string) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `#!/bin/sh\nif [ "$1" = -p ]; then echo ${version}; else echo "ran ${version} $*"; fi\n`);
  chmodSync(path, 0o755);
}

function run(home: string, bin: string, env: Record<string, string> = {}) {
  const r = spawnSync(join(bin, "sh"), [FINDER, "hook.ts", "check"], {
    encoding: "utf8",
    env: { HOME: home, PATH: bin, MW_AGENT_TOOLS_SYSTEM_DIRS: "", ...env },
  });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}

test("finds the newest suitable nvm Node when PATH has none", () => {
  const { home, bin } = sandbox();
  try {
    fakeNode(join(home, ".nvm/versions/node/v20.11.0/bin/node"), "20.11.0");
    fakeNode(join(home, ".nvm/versions/node/v22.9.0/bin/node"), "22.9.0");
    fakeNode(join(home, ".nvm/versions/node/v22.18.0/bin/node"), "22.18.0");
    assert.deepEqual(run(home, bin), { code: 0, out: "ran 22.18.0 hook.ts check", err: "" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("passes over a Node on PATH that is too old", () => {
  const { home, bin } = sandbox();
  try {
    fakeNode(join(bin, "node"), "22.17.0");
    fakeNode(join(home, ".volta/bin/node"), "24.1.0");
    assert.equal(run(home, bin).out, "ran 24.1.0 hook.ts check");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("uses MW_AGENT_TOOLS_NODE first, and a suitable Node on PATH before version managers", () => {
  const { home, bin } = sandbox();
  try {
    fakeNode(join(home, ".nvm/versions/node/v26.0.0/bin/node"), "26.0.0");
    fakeNode(join(bin, "node"), "23.0.0");
    fakeNode(join(home, "pinned/node"), "22.20.0");
    assert.equal(run(home, bin).out, "ran 23.0.0 hook.ts check");
    assert.equal(run(home, bin, { MW_AGENT_TOOLS_NODE: join(home, "pinned/node") }).out, "ran 22.20.0 hook.ts check");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("says once when no suitable Node exists, then again only after one was found", () => {
  const { home, bin } = sandbox();
  try {
    const first = run(home, bin);
    assert.equal(first.code, 1);
    assert.match(first.err, /no Node\.js 22\.18 or newer found.*hook\.ts did not run/);
    assert.deepEqual(run(home, bin), { code: 0, out: "", err: "" });
    fakeNode(join(home, ".local/bin/node"), "22.18.1");
    assert.equal(run(home, bin).code, 0);
    rmSync(join(home, ".local/bin/node"));
    assert.equal(run(home, bin).code, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("every hook runs its script through the plugin's Node finder", () => {
  for (const plugin of readdirSync(join(root, "plugins"))) {
    const hooks = join(root, "plugins", plugin, "hooks");
    if (!existsSync(hooks)) continue;
    assert.ok(existsSync(join(root, "plugins", plugin, "scripts/node.sh")), `${plugin} carries node.sh`);
    for (const f of readdirSync(hooks)) {
      const commands = [...readFileSync(join(hooks, f), "utf8").matchAll(/"(?:command|bash)": "([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) => m[1]);
      assert.ok(commands.length, `${plugin}/${f} has commands`);
      for (const c of commands) assert.match(c, /^sh \\"\$\{?[A-Z_]*PLUGIN_ROOT\}?\/scripts\/node\.sh\\" /, `${plugin}/${f}: ${c}`);
    }
  }
});
