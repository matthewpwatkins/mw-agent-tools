#!/usr/bin/env node
// Generates every agent's plugin and marketplace manifests from catalog.json, the one source of truth.
//   node scripts/sync-manifests.ts          write them (and copy scripts/node.sh into each plugin with hooks)
//   node scripts/sync-manifests.ts --check  exit 1 if any are out of date (used by the tests)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface Plugin {
  name: string;
  version: string;
  description: string;
  category: string;
  keywords?: string[];
  hooks?: { codex?: string; cursor?: string; copilot?: string };
}
interface Catalog {
  marketplace: {
    name: string;
    displayName: string;
    description: string;
    owner: { name: string; url?: string };
    repository: string;
  };
  plugins: Plugin[];
}

export function render(catalog: Catalog): Record<string, unknown> {
  const m = catalog.marketplace;
  const files: Record<string, unknown> = {};
  const author = { name: m.owner.name, ...(m.owner.url ? { url: m.owner.url } : {}) };

  files[".claude-plugin/marketplace.json"] = {
    name: m.name,
    owner: author,
    metadata: { description: m.description },
    plugins: catalog.plugins.map((p) => ({
      name: p.name,
      source: `./plugins/${p.name}`,
      description: p.description,
      version: p.version,
      category: p.category.toLowerCase(),
      keywords: p.keywords,
    })),
  };
  files[".agents/plugins/marketplace.json"] = {
    name: m.name,
    interface: { displayName: m.displayName },
    plugins: catalog.plugins.map((p) => ({
      name: p.name,
      source: { source: "local", path: `./plugins/${p.name}` },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: p.category,
    })),
  };
  files[".cursor-plugin/marketplace.json"] = {
    name: m.name,
    owner: author,
    metadata: { description: m.description },
    plugins: catalog.plugins.map((p) => ({ name: p.name, source: `./plugins/${p.name}`, description: p.description })),
  };

  for (const p of catalog.plugins) {
    const base = {
      name: p.name,
      version: p.version,
      description: p.description,
      author,
      repository: m.repository,
      license: "MIT",
      keywords: p.keywords,
    };
    const dir = `plugins/${p.name}`;
    files[`${dir}/.claude-plugin/plugin.json`] = base;
    files[`${dir}/.codex-plugin/plugin.json`] = {
      ...base,
      skills: "./skills/",
      ...(p.hooks?.codex ? { hooks: p.hooks.codex } : {}),
      interface: {
        displayName: p.name,
        shortDescription: p.description,
        developerName: m.owner.name,
        category: p.category,
        websiteURL: m.repository,
      },
    };
    // Copilot CLI reads this legacy location before .claude-plugin, so it gets its own hooks file.
    files[`${dir}/.github/plugin/plugin.json`] = {
      ...base,
      skills: "./skills/",
      ...(p.hooks?.copilot ? { hooks: p.hooks.copilot } : {}),
    };
    files[`${dir}/.cursor-plugin/plugin.json`] = {
      ...base,
      skills: "./skills/",
      ...(p.hooks?.cursor ? { hooks: p.hooks.cursor } : {}),
    };
  }
  return files;
}

function main(): number {
  const root = resolve(import.meta.dirname, "..");
  const catalog: Catalog = JSON.parse(readFileSync(join(root, "catalog.json"), "utf8"));
  const checkOnly = process.argv.includes("--check");
  const stale: string[] = [];
  for (const [rel, data] of Object.entries(render(catalog))) {
    const path = join(root, rel);
    const text = JSON.stringify(data, null, 2) + "\n";
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (current === text) continue;
    stale.push(rel);
    if (!checkOnly) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
  }
  // Each plugin with hooks installs on its own, so each carries its own copy of the Node finder.
  const finder = readFileSync(join(root, "scripts/node.sh"), "utf8");
  for (const p of catalog.plugins) {
    if (!existsSync(join(root, "plugins", p.name, "hooks"))) continue;
    const rel = `plugins/${p.name}/scripts/node.sh`;
    const path = join(root, rel);
    if ((existsSync(path) ? readFileSync(path, "utf8") : "") === finder) continue;
    stale.push(rel);
    if (!checkOnly) writeFileSync(path, finder, { mode: 0o755 });
  }
  if (checkOnly && stale.length) {
    console.error(`out of date, run: npm run sync\n${stale.join("\n")}`);
    return 1;
  }
  if (!checkOnly) console.log(stale.length ? `wrote ${stale.length} file(s)` : "manifests up to date");
  return 0;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) process.exitCode = main();
