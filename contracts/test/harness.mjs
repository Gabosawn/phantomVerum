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

export const summary = (title) => {
  console.log(`\n=== ${title}: ${run - failures}/${run} ${failures === 0 ? 'OK' : `— ${failures} FAILURES`} ===`);
  process.exit(failures === 0 ? 0 : 1);
};
