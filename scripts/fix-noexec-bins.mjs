/**
 * `/home/snatty/Data` is mounted `noexec`. That breaks:
 *   1. Rollup native `.node` bindings → switch to `@rollup/wasm-node`
 *   2. esbuild ELF binaries → copy them to `/tmp` (exec) and symlink back
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = join(tmpdir(), "phantomtrace-noexec-bins");
const require = createRequire(import.meta.url);

function fixRollup() {
  const rollupDir = join(root, "node_modules", "rollup");
  const wasmDir = join(root, "node_modules", "@rollup", "wasm-node");
  if (!existsSync(rollupDir) || !existsSync(wasmDir)) return;

  try {
    require(join(rollupDir, "dist", "native.js"));
    console.log("(postinstall) rollup native bindings OK");
    return;
  } catch {
    /* fall through */
  }

  console.log("(postinstall) rollup native failed — switching to @rollup/wasm-node");
  rmSync(rollupDir, { recursive: true, force: true });
  cpSync(wasmDir, rollupDir, { recursive: true });
  const pkgPath = join(rollupDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.name = "rollup";
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === ".cache") continue;
      walk(p, out);
    } else if (ent.isFile()) {
      if (ent.name === "esbuild" || ent.name.endsWith(".node")) out.push(p);
    }
  }
}

function alreadyOnExecFs(absPath) {
  try {
    const st = lstatSync(absPath);
    if (!st.isSymbolicLink()) return false;
    const target = readlinkSync(absPath);
    return target.startsWith("/tmp") || target.startsWith(tmpdir());
  } catch {
    return false;
  }
}

function relocateBin(absPath) {
  if (alreadyOnExecFs(absPath)) return false;
  const rel = relative(join(root, "node_modules"), absPath);
  const dest = join(cacheRoot, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(absPath, dest);
  rmSync(absPath);
  symlinkSync(dest, absPath);
  return true;
}

function fixNativeBins() {
  mkdirSync(cacheRoot, { recursive: true });
  const bins = [];
  walk(join(root, "node_modules"), bins);
  let moved = 0;
  for (const b of bins) {
    if (relocateBin(b)) moved += 1;
  }
  console.log(`(postinstall) relocated ${moved}/${bins.length} native bin(s) → ${cacheRoot}`);
}

/**
 * testkit-js 4.1.1's `syncWallet` hardcodes a 90 s timeout. A fresh wallet on
 * Preview must replay ~50k Zswap events and takes 3–5 min to sync the first
 * time, so `waitForFunds` always dies with "Wallet sync timeout after 90000ms".
 * Bump the default to 10 min. A one-line patch, re-applied on every install.
 */
function fixTestkitSyncTimeout() {
  const target = join(root, "node_modules", "@midnight-ntwrk", "testkit-js", "dist", "index.mjs");
  if (!existsSync(target)) return;
  const src = readFileSync(target, "utf8");
  const patched = src.replace(
    "const syncWallet = (wallet, throttleTime = 2_000, timeout = 90_000)",
    "const syncWallet = (wallet, throttleTime = 2_000, timeout = 600_000)",
  );
  if (patched === src) {
    console.log("(postinstall) testkit sync timeout already patched");
    return;
  }
  writeFileSync(target, patched);
  console.log("(postinstall) patched testkit-js syncWallet timeout 90s → 600s");
}

fixRollup();
fixNativeBins();
fixTestkitSyncTimeout();
