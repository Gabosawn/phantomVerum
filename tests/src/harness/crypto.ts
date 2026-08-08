/**
 * THE single mirror of the contract's hash-shaped pure circuits lives in
 * `@phantomtrace/shared/crypto` — verified digest-for-digest against the compiled contract by
 * `contract-agreement.test.ts`. This file exists so every test, the model backend, the
 * witnesses and the e2e keep their existing import site.
 *
 * Seven of them: `anchorOf`, `orgIdOf`, `credCommitmentOf`, `leafOf`, `reportIdOf`,
 * `nullifierOf`, `receiptOf`. The contract also exports `minAnonymitySet` and
 * `maxCredentialsPerOrg`, which are policy constants rather than hashes and are read straight
 * off `pureCircuits` so no copy of the number can drift from the enforced one.
 *
 * Historically this file WAS the implementation (using compact-runtime's Buffer-based
 * `fromHex`/`toHex`). Moving the implementation to `shared/` is what lets the browser demo and
 * the test harness share ONE verified source of truth instead of two drifting copies.
 */

export {
  MERKLE_DEPTH,
  MERKLE_PATH_TYPE,
  DOMAIN_TAGS,
  EPOCH_DURATION,
  anchorOf,
  bytesToHex,
  credCommitmentOf,
  hexToBytes,
  leafHashOf,
  leafOf,
  nullifierOf,
  orgIdOf,
  pad32,
  padHex32,
  periodBytes32,
  periodHex32,
  receiptOf,
  reportIdOf,
} from "@phantomtrace/shared/crypto";
