// Shared harness: runs the REAL COMPILED contract in the local simulator of
// @midnight-ntwrk/compact-runtime — no network, no proof server, no mocks.
// Requires a prior `npm run compile` (or `compile:fast`).

import { Contract, ledger as readLedger, pureCircuits } from '../output/contract/index.js';
import {
  createConstructorContext,
  createCircuitContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';

export { Contract, readLedger, pureCircuits };

// Must match the contract's `epochDuration()` (seconds).
export const EPOCH_DURATION = 86400n;

// Fixed instant so the tests are deterministic.
// 2026-08-07T00:00:00Z in Unix seconds.
export const NOW = 1786147200;
export const EPOCH = BigInt(NOW) / EPOCH_DURATION;

export const b32 = (fill) => Uint8Array.from({ length: 32 }, (_, i) => (fill + i) % 256);
export const hex = (u8) => Buffer.from(u8).toString('hex');

/**
 * Creates a "world": contract + state, with `call(name, ...args)` advancing
 * the state. `at(seconds)` moves the clock to exercise epochs.
 */
export function newWorld(witnesses, { now = NOW } = {}) {
  const contract = new Contract(witnesses);
  const address = sampleContractAddress();
  const initial = contract.initialState(createConstructorContext({}, '0'.repeat(64)));

  let contractState = initial.currentContractState;
  let zswap = initial.currentZswapLocalState;
  let priv = initial.currentPrivateState;
  let clock = now;

  const ctx = () =>
    createCircuitContext(address, zswap, contractState, priv, undefined, undefined, clock);

  const absorb = (r) => {
    contractState = r.context.currentQueryContext.state;
    zswap = r.context.currentZswapLocalState;
    priv = r.context.currentPrivateState;
    return r;
  };

  return {
    address,
    at: (seconds) => { clock = seconds; },
    now: () => clock,
    ctx,
    state: () => readLedger(contractState),
    call: (name, ...args) => absorb(contract.impureCircuits[name](ctx(), ...args)),
    // Calls with ANOTHER witness set over the SAME state (impostors).
    callAs: (otherWitnesses, name, ...args) =>
      absorb(new Contract(otherWitnesses).impureCircuits[name](ctx(), ...args)),
  };
}

// ---- mini assert framework ----
let failures = 0;
let run = 0;

export const check = (name, cond, detail = '') => {
  run++;
  if (cond) console.log(`  ok    ${name}${detail ? ` (${detail})` : ''}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ''}`); }
};

/** Expects `fn` to throw, with a message containing `fragment`. */
export const checkRejects = (name, fn, fragment) => {
  run++;
  try {
    fn();
    failures++;
    console.log(`  FAIL  ${name} -> did NOT throw (expected "${fragment}")`);
  } catch (e) {
    const msg = String(e.message).split('\n')[0];
    if (fragment && !msg.includes(fragment)) {
      failures++;
      console.log(`  FAIL  ${name} -> threw "${msg}", expected "${fragment}"`);
    } else {
      console.log(`  ok    ${name} -> rejected: ${msg}`);
    }
  }
};

let gaps = 0;

/**
 * A property we WANT to hold, that the shipped contract does NOT hold.
 *
 * `cond` is the property. While it is false the suite stays green and prints a
 * loud GAP line — the hole is documented, not hidden, and `README.md` carries
 * the same finding with its fix. The moment the property starts holding, this
 * FAILS: a closed gap must be promoted to a real `check`, not left rotting as
 * a permanent excuse.
 *
 * This exists because the alternative was worse. The [HIGH-1] block used to
 * assert "one report per credential per epoch" while only varying `period`,
 * so it passed while the property it named was false. A test that is green
 * for the wrong reason is more dangerous than one that is red.
 */
export const checkKnownGap = (name, cond, ref, detail = '') => {
  run++;
  if (!cond) {
    gaps++;
    console.log(`  GAP   ${name}${detail ? ` (${detail})` : ''}\n        known, unfixed — see ${ref}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name} -> the gap is CLOSED. Promote this to check() and drop ${ref}.`);
  }
};

export const summary = (title) => {
  const passed = run - failures - gaps;
  const parts = [`${passed}/${run}`, failures === 0 ? 'OK' : `— ${failures} FAILURES`];
  if (gaps > 0) parts.push(`— ${gaps} KNOWN GAP${gaps > 1 ? 'S' : ''}`);
  console.log(`\n=== ${title}: ${parts.join(' ')} ===`);
  process.exit(failures === 0 ? 0 : 1);
};
