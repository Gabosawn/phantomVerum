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

fixRollup();
fixNativeBins();
