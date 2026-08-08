/**
 * The issuer's key store — the fix for C-1 (audit 2026-08-09).
 *
 * WHAT WAS BROKEN
 *
 * The issuer secret used to be DERIVED from the orgId:
 *
 *     sha256("phantomtrace:demo-issuer:v1:" + orgId)
 *
 * `orgId` is public — both `registerOrganization` and `issueCredential`
 * disclose it on-chain. So anyone who read the chain could recompute the
 * secret, satisfy the contract's `anchorOf(issuerSecret()) == lookup(orgId)`
 * check, and mint credentials under somebody else's organization. The
 * contract's issuer authentication was real; this derivation handed out the
 * key. Worse, the shipped CLI used it in `--network` mode too, so every org
 * registered with the tooling — Preview included — was unprotected.
 *
 * WHY IT WAS DERIVED IN THE FIRST PLACE
 *
 * `register-org` and `issue-credential` are separate process invocations that
 * share no memory. They have to arrive at the SAME secret or the anchor check
 * rejects the issuance. Deriving it from a public value made that trivially
 * reproducible — and trivially forgeable.
 *
 * THE FIX
 *
 * Reproducible across processes does not require being derivable from public
 * data: it requires PERSISTENCE. `register-org` now generates a random secret
 * and writes it here; `issue-credential` reads it back. An attacker who reads
 * the whole chain learns nothing, because the secret was never a function of
 * anything on it.
 *
 * This store holds ISSUER keys (the organization's side). It is deliberately a
 * separate file from `secrets/denunciante.json`, which holds the
 * WHISTLEBLOWER's keys: in the real deployment those two live on different
 * machines owned by parties with opposed interests, and nothing in the demo
 * should suggest they belong together.
 *
 * STILL A DEMO (declared limitation)
 *
 * A plaintext 0600 file is not a vault. A production issuer keeps this in an
 * HSM or a KMS, and the real issuer is a signing corporate directory (Azure
 * AD) rather than this CLI. What this fix removes is the part that was not a
 * "limitation" but a hole: a key that anybody could recompute from public data.
 */
import fs from 'node:fs';
import path from 'node:path';

import { type Hex32, toHex, isHex32, randomBytes32 } from '../witnesses/hex.js';
import { repoRoot } from '../witnesses/secrets.js';

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/** Bumped when the on-disk shape changes; a mismatch is a hard error. */
export const ISSUER_KEYSTORE_VERSION = 1 as const;

interface IssuerKeystore {
  readonly version: typeof ISSUER_KEYSTORE_VERSION;
  /** orgId (64-hex) -> issuer secret (64-hex). */
  readonly keys: Record<Hex32, Hex32>;
}

export class IssuerKeyNotFoundError extends Error {
  constructor(
    public readonly orgId: Hex32,
    public readonly path: string,
  ) {
    super(
      `no issuer key for org ${orgId.slice(0, 16)}… in ${path}\n` +
        '  The issuer secret is random since the C-1 fix, so it cannot be rederived.\n' +
        '  Register the organization on this machine (`register-org`), or pass the\n' +
        '  secret explicitly if you kept it elsewhere.',
    );
    this.name = 'IssuerKeyNotFoundError';
  }
}

export class CorruptIssuerKeystoreError extends Error {
  constructor(detail: string, public readonly path: string) {
    super(`invalid issuer keystore at ${path}: ${detail}`);
    this.name = 'CorruptIssuerKeystoreError';
  }
}

/**
 * Path of the store. Override with `TESTIGO_ISSUER_KEYS` — the selftests and
 * the simulator use it so a demo run never touches real issuer keys.
 */
export function issuerKeystorePath(): string {
  const override = process.env['TESTIGO_ISSUER_KEYS'];
  if (override !== undefined && override !== '') return path.resolve(override);
  return path.join(repoRoot(), 'secrets', 'issuer-keys.json');
}

function read(filePath: string): IssuerKeystore {
  if (!fs.existsSync(filePath)) {
    return { version: ISSUER_KEYSTORE_VERSION, keys: {} };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new CorruptIssuerKeystoreError(
      `not valid JSON (${e instanceof Error ? e.message : String(e)})`,
      filePath,
    );
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CorruptIssuerKeystoreError('the JSON is not an object', filePath);
  }
  const o = raw as Record<string, unknown>;
  if (o['version'] !== ISSUER_KEYSTORE_VERSION) {
    throw new CorruptIssuerKeystoreError(
      `version ${String(o['version'])}, expected ${ISSUER_KEYSTORE_VERSION}`,
      filePath,
    );
  }
  const keys = o['keys'];
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) {
    throw new CorruptIssuerKeystoreError('"keys" is not an object', filePath);
  }
  for (const [org, secret] of Object.entries(keys as Record<string, unknown>)) {
    if (!isHex32(org)) {
      throw new CorruptIssuerKeystoreError(`key "${org}" is not 64-char hex`, filePath);
    }
    if (!isHex32(secret)) {
      throw new CorruptIssuerKeystoreError(
        `the secret for "${org}" is not 64-char hex`,
        filePath,
      );
    }
  }
  return { version: ISSUER_KEYSTORE_VERSION, keys: keys as Record<Hex32, Hex32> };
}

/**
 * Atomic write with 0600 permissions — same discipline as the whistleblower
 * store: the temp file is created already in 0600 and `rename` preserves the
 * mode, so the secret never exists on disk world-readable.
 */
function write(store: IssuerKeystore, filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: FILE_MODE });
  try {
    fs.renameSync(tmp, filePath);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  fs.chmodSync(filePath, FILE_MODE);
}

/** The stored secret for `orgId`, or `null` when this machine never issued it. */
export function loadIssuerSecret(orgId: Hex32, filePath?: string): Hex32 | null {
  const target = filePath === undefined ? issuerKeystorePath() : path.resolve(filePath);
  return read(target).keys[orgId] ?? null;
}

/** Like `loadIssuerSecret`, but fails with an actionable message. */
export function requireIssuerSecret(orgId: Hex32, filePath?: string): Hex32 {
  const target = filePath === undefined ? issuerKeystorePath() : path.resolve(filePath);
  const secret = read(target).keys[orgId];
  if (secret === undefined) throw new IssuerKeyNotFoundError(orgId, target);
  return secret;
}

/**
 * Persists `secret` as the issuer key for `orgId`.
 *
 * Refuses to overwrite a different secret for an org that already has one:
 * on-chain the anchor is immutable, so replacing the key locally would silently
 * lock the org out of issuing forever, with the failure only surfacing later as
 * "not the issuer of this organization".
 */
export function saveIssuerSecret(orgId: Hex32, secret: Hex32, filePath?: string): void {
  const target = filePath === undefined ? issuerKeystorePath() : path.resolve(filePath);
  const store = read(target);
  const existing = store.keys[orgId];
  if (existing !== undefined && existing !== secret) {
    throw new Error(
      `refusing to overwrite the issuer key for org ${orgId.slice(0, 16)}…: the ` +
        'anchor published on-chain commits to the old secret, so replacing it ' +
        'here would lock this org out of issuing permanently.',
    );
  }
  write({ version: ISSUER_KEYSTORE_VERSION, keys: { ...store.keys, [orgId]: secret } }, target);
}

/**
 * The secret for `orgId`, generating and persisting a fresh random one the
 * first time. This is what `register-org` uses: the org does not exist yet, so
 * there is nothing to look up.
 */
export function ensureIssuerSecret(orgId: Hex32, filePath?: string): Hex32 {
  const existing = loadIssuerSecret(orgId, filePath);
  if (existing !== null) return existing;
  const fresh = toHex(randomBytes32());
  saveIssuerSecret(orgId, fresh, filePath);
  return fresh;
}
