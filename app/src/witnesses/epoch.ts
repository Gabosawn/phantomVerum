// Reporting epoch index (the public `period` argument of `report`).
//
// `period` is NOT a free label chosen by the caller: the circuit binds it to
// the chain clock with `blockTimeGte(start)` / `blockTimeLt(end)`
// (contracts/src/testigo.compact, `report` circuit, comment C0). That fix is
// finding HIGH-1 of the review (docs/03-plan-ejecucion.md §3.4): with a free
// `period`, the same credential produced N distinct nullifiers by varying the
// label and the anti-spam was worth nothing.
//
// ⚠️ UNIT: SECONDS. Midnight's blockTime is `secondsSinceEpoch`, and the
// contract's `epochDuration()` returns 86400 (one day IN SECONDS). Passing
// milliseconds makes `report` ALWAYS fail against the chain, with a
// "period not started yet" that says nothing about the real cause.

/**
 * Duration of one epoch in SECONDS. Mirror of `epochDuration()` in
 * `contracts/src/testigo.compact`. If it changes there, it changes here.
 *
 * Deliberately coarse (1 day): fine periods allow correlating reports by
 * timing (spec §6).
 */
export const EPOCH_DURATION_SEC = 86400n;

/** Epoch index of a given Unix instant IN SECONDS. */
export function epochOfSeconds(unixSeconds: bigint | number): bigint {
  const s = typeof unixSeconds === 'bigint' ? unixSeconds : BigInt(Math.floor(unixSeconds));
  if (s < 0n) throw new RangeError('the Unix instant cannot be negative');
  return s / EPOCH_DURATION_SEC;
}

/**
 * Current epoch according to the local clock.
 *
 * `Date.now()` comes in MILLISECONDS: the division by 1000 here is what
 * avoids the bug described above. This is the value that goes as `period` to
 * `report(orgId, period)` and to `nullifierOf(sec, orgId, period)`.
 *
 * Note: if the local clock is skewed against the chain's by more than what is
 * left until the epoch change, the circuit rejects. The app can retry with a
 * recomputed `currentEpoch()`.
 */
export function currentEpoch(): bigint {
  return epochOfSeconds(Math.floor(Date.now() / 1000));
}

/** Unix instant (seconds) at which an epoch starts. */
export function epochStart(period: bigint): bigint {
  return period * EPOCH_DURATION_SEC;
}

/** Unix instant (seconds, exclusive) at which an epoch ends. */
export function epochEnd(period: bigint): bigint {
  return epochStart(period) + EPOCH_DURATION_SEC;
}

// ── Serialization ───────────────────────────────────────────────────────
// `JSON.stringify` throws TypeError on a bigint. Every persisted `period`
// travels as a decimal string and comes back with `periodFromJson`.

const RE_DECIMAL = /^(0|[1-9][0-9]*)$/;

export function periodToJson(period: bigint): string {
  return period.toString(10);
}

export function periodFromJson(value: string): bigint {
  if (!RE_DECIMAL.test(value)) {
    throw new TypeError(`"${value}" is not a valid period (unsigned decimal integer)`);
  }
  return BigInt(value);
}

export function isSerializedPeriod(value: unknown): value is string {
  return typeof value === 'string' && RE_DECIMAL.test(value);
}
