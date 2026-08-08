/**
 * Workarounds for a checkout on a `noexec` mount (the original case was
 * `/home/snatty/Data`). Both are DETECTED, not assumed — on a normal
 * filesystem, including CI, each one no-ops:
 *   1. Rollup native `.node` bindings → switch to `@rollup/wasm-node`
 *   2. esbuild ELF binaries → copy them to `$TMPDIR` (exec) and symlink back
 *
 * Plus one unrelated dependency patch; see `fixTestkitSyncTimeout`.
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
import { execFileSync } from "node:child_process";
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

/**
 * Can we actually execute a binary from `node_modules`?
 *
 * The relocation below is a workaround for ONE machine whose checkout sits on
 * a `noexec` mount. Everywhere else — CI runners, most laptops — it is pure
 * harm: it rewrites every native binary in `node_modules` into a symlink into
 * `$TMPDIR`, so anything that cleans temp files between steps leaves the tree
 * full of dangling links and esbuild stops resolving. Probe first.
 */
function canExecFromNodeModules(bins) {
  const probe = bins.find((p) => p.endsWith("/esbuild"));
  if (!probe || alreadyOnExecFs(probe)) return false;
  try {
    execFileSync(probe, ["--version"], { stdio: "ignore" });
    return true;
  } catch (e) {
    // EACCES / ENOEXEC mean the mount refuses it. Anything else (a broken
    // binary, a missing loader) is not a `noexec` problem and relocating it
    // would not help either — but relocating is the historical behaviour, so
    // only skip on a clean success.
    return false;
  }
}

function fixNativeBins() {
  const bins = [];
  walk(join(root, "node_modules"), bins);

  // `walk` only reports regular files, so anything relocated on an earlier
  // install is invisible here: an empty list means "nothing left to do",
  // whichever of the two reasons it is.
  if (bins.length === 0) {
    console.log("(postinstall) no native bins to relocate");
    return;
  }

  if (canExecFromNodeModules(bins)) {
    console.log(`(postinstall) node_modules is executable — leaving ${bins.length} native bin(s) in place`);
    return;
  }

  mkdirSync(cacheRoot, { recursive: true });
  let moved = 0;
  for (const b of bins) {
    if (relocateBin(b)) moved += 1;
  }
  console.log(`(postinstall) noexec detected — relocated ${moved}/${bins.length} native bin(s) → ${cacheRoot}`);
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
