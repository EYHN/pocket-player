#!/usr/bin/env node
// Builds dist/<line>/ for a PocketJS release line named in versions.json:
//
//   node scripts/build.mjs 0.15
//
// It lays out the files a page loads the way PocketJS's `bun tools/pocket3d-web.ts stage` does —
// the Pocket3D player's modules, the handheld shells, the guest realm, the UI core — from the pinned
// tag, takes the prebuilt UI core from the pinned npm package (checked against its SHA-256), bundles
// the two framework modules the player imports with esbuild, and adds src/core.js and src/player.js beside them.
// Needs git, npm and network access; nothing of PocketJS is installed.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const line = process.argv[2];
const versions = JSON.parse(readFileSync(join(ROOT, "scripts/versions.json"), "utf8"));
const pin = versions[line];
if (!pin) {
  console.error(`usage: node scripts/build.mjs <${Object.keys(versions).join("|")}>`);
  process.exit(1);
}

const run = (command, args, options = {}) => execFileSync(command, args, { stdio: ["ignore", "pipe", "inherit"], ...options }).toString().trim();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const work = mkdtempSync(join(tmpdir(), "pocket-player-"));
const out = join(ROOT, "dist", line);

try {
  // The source at the pinned commit.
  const src = join(work, "pocketjs");
  run("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", pin.tag, "https://github.com/pocket-nexus/pocketjs.git", src]);
  const commit = run("git", ["-C", src, "rev-parse", "HEAD"]);
  if (commit !== pin.commit) throw new Error(`${pin.tag} is ${commit}, versions.json pins ${pin.commit}`);

  // The prebuilt UI core, from the npm package of the same release.
  const tarball = run("npm", ["pack", `@pocketjs/framework@${pin.npm}`, "--silent", "--pack-destination", work], { cwd: work });
  run("tar", ["-xzf", join(work, tarball), "-C", work, "package/hosts/web/pocketjs.wasm"]);
  const wasm = readFileSync(join(work, "package/hosts/web/pocketjs.wasm"));
  if (sha256(wasm) !== pin.wasmSha256) throw new Error(`pocketjs.wasm of ${pin.npm} is ${sha256(wasm)}, versions.json pins ${pin.wasmSha256}`);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const web = join(src, "devices/web/pocket-web-wgpu/web");
  for (const file of ["pocket3d-shell.js", "pocket3d-interface.js", "pocket3d-controls.js", "pocket3d-stage.js", "pocket3d-stage.css", "pocket3d-player.js", "pocket3d-player.css", "pocket3d-words.js"]) {
    cpSync(join(web, file), join(out, file));
  }
  for (const directory of ["shells", "fonts"]) cpSync(join(web, directory), join(out, directory), { recursive: true });
  for (const file of ["pocket3d-title.js", "art.js"]) cpSync(join(src, "engine/pocket3d/crates/pocket3d-title/web", file), join(out, file));
  for (const file of ["app-instance.html", "app-instance.js", "wasm-ops.js", "runtime-glyphs.js", "offload-worker.js"]) {
    cpSync(join(src, "hosts/web", file), join(out, file));
  }
  writeFileSync(join(out, "pocketjs.wasm"), wasm);

  // The contact wire format, the touch hit facts and the button bits, as tools/pocket3d-web.ts bundles them.
  // (built from inside the checkout, so the bundle's path comments are the same on every machine)
  writeFileSync(join(src, "pocketjs-host.ts"), `export { __packTouch, createTouchHitFacts } from "./framework/src/touch.ts";\nexport { BTN } from "./contracts/spec/spec.ts";\n`);
  run("npx", ["--yes", "esbuild@0.25.11", "pocketjs-host.ts", "--bundle", "--format=esm", "--platform=browser", "--log-level=warning", `--outfile=${join(out, "pocketjs-host.js")}`], { cwd: src });

  cpSync(join(src, "LICENSE"), join(out, "LICENSE-PocketJS.txt"));
  cpSync(join(src, "pocket3d/LICENSE"), join(out, "LICENSE-Pocket3D.txt"));
  cpSync(join(ROOT, "LICENSE"), join(out, "LICENSE-pocket-player.txt"));
  for (const file of ["core.js", "player.js"]) cpSync(join(ROOT, "src", file), join(out, file));
  writeFileSync(join(out, "NOTICE.md"), readFileSync(join(ROOT, "NOTICE.md"), "utf8").replaceAll("{tag}", pin.tag).replaceAll("{commit}", pin.commit).replaceAll("{npm}", pin.npm));

  const files = [];
  const walk = (directory, prefix = "") => {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      if (name.isDirectory()) walk(join(directory, name.name), `${prefix}${name.name}/`);
      else files.push(`${prefix}${name.name}`);
    }
  };
  walk(out);
  writeFileSync(join(out, "files.sha256"), files.sort().filter((f) => f !== "files.sha256").map((f) => `${sha256(readFileSync(join(out, f)))}  ${f}`).join("\n") + "\n");
  console.log(`dist/${line}: ${files.length} files from PocketJS ${pin.tag} (${pin.commit.slice(0, 9)})`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
