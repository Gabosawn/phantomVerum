// B2.2 — Local hash of the evidence file.
//
// ┌────────────────────────────────────────────────────────────────────────┐
// │ THE EVIDENCE FILE NEVER LEAVES THIS MACHINE.                           │
// │                                                                        │
// │ It is not uploaded to IPFS, nor to a bucket, nor to the indexer, nor   │
// │ to the proof server (which also runs locally, docs/01 §1). The only    │
// │ thing crossing into the circuit is its 32-byte digest, and the only    │
// │ thing reaching the ledger is                                           │
// │ `reportId = H(dom ‖ evidenceHash ‖ reportSecret)` — a hash of the      │
// │ hash, with a 32-byte-entropy secret in the middle.                     │
// │                                                                        │
// │ This module has and must have NO network imports. If one ever shows    │
// │ up here, it is a privacy bug, not a feature.                           │
// └────────────────────────────────────────────────────────────────────────┘
//
// On why the secret matters: `evidenceHash` on its own is NOT a secret. The
// employer owns the reported documents and can hash them all and compare.
// What makes `reportId` non-invertible is the 32 random bytes of
// `reportSecret` concatenated to it (docs/03-plan-ejecucion.md §3.2).

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';

import { type Hex32, BYTE_LENGTH, toHex } from './hex.js';

export class UnreadableEvidenceError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`could not read the evidence at ${filePath}: ${String(cause)}`);
    this.name = 'UnreadableEvidenceError';
  }
}

/** sha-256 of an in-memory buffer -> 32 bytes. */
export function hashEvidenceBytes(data: Uint8Array): Uint8Array {
  const digest = Uint8Array.from(createHash('sha256').update(data).digest());
  /* c8 ignore next */
  if (digest.length !== BYTE_LENGTH) throw new Error('sha-256 did not return 32 bytes');
  return digest;
}

/**
 * sha-256 of the file -> 32 bytes. Deterministic: same content, same hash,
 * regardless of the file's name, path or date.
 *
 * Read via stream and not with `readFileSync` so that a large piece of
 * evidence (a scanned PDF, a mail dump) does not have to fit in memory.
 */
export async function hashEvidenceFile(filePath: string): Promise<Uint8Array> {
  const absolute = path.resolve(filePath);
  try {
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error('not a regular file');
  } catch (e) {
    throw new UnreadableEvidenceError(absolute, e);
  }

  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(absolute)) {
      hash.update(chunk as Buffer);
    }
  } catch (e) {
    throw new UnreadableEvidenceError(absolute, e);
  }
  return Uint8Array.from(hash.digest());
}

export interface EvidenceSummary {
  /** 32-byte digest: the ONLY thing of the evidence that enters the circuit. */
  readonly hash: Uint8Array;
  readonly hashHex: Hex32;
  /** Purely local metadata, so the CLI can show what was hashed. */
  readonly name: string;
  readonly bytes: number;
}

/**
 * Hash + metadata for the CLI output (`report.ts`, B4.3).
 *
 * `name` and `bytes` are ONLY for printing in the whistleblower's terminal:
 * they are not sent anywhere. The file name is usually identifying
 * ("sumario-2026-planta-quilmes.pdf") — keeping it out of the circuit is
 * deliberate.
 */
export async function evidenceSummary(filePath: string): Promise<EvidenceSummary> {
  const absolute = path.resolve(filePath);
  const info = await stat(absolute).catch((e: unknown) => {
    throw new UnreadableEvidenceError(absolute, e);
  });
  const hash = await hashEvidenceFile(absolute);
  return {
    hash,
    hashHex: toHex(hash),
    name: path.basename(absolute),
    bytes: info.size,
  };
}
