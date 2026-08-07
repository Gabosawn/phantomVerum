// Selftest of B2.1 (secrets) + B2.2 (evidence) + the epoch helpers.
//
// Touches no network, no compiled contract, and none of the whistleblower's
// real secrets: it works entirely on a temporary directory. The witness
// selftest against the simulator lives apart, in `selftest-simulator.ts`.
//
//   npm run build --workspace=app && node app/dist/witnesses/selftest.js

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { check, checkRejects, checkRejectsAsync, summary } from './check.js';
import {
  EPOCH_DURATION_SEC,
  currentEpoch,
  epochOfSeconds,
  epochEnd,
  epochStart,
  periodToJson,
  periodFromJson,
} from './epoch.js';
import { hashEvidenceFile, hashEvidenceBytes, evidenceSummary } from './evidence.js';
import { toBytes32, toHex, randomBytes32, isHex32 } from './hex.js';
import {
  CorruptSecretsError,
  addReport,
  createSecrets,
  secretsExist,
  setLeafIndex,
  readSecrets,
  listReports,
  newReportSecret,
  getReport,
  periodOfRecord,
  secretsPath,
} from './secrets.js';

// ── fixtures ────────────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testigo-selftest-'));
const tmpPath = path.join(tmpDir, 'secrets', 'denunciante.json');
const orgId = toHex(Uint8Array.from({ length: 32 }, (_, i) => (0x11 + i) % 256));

async function main(): Promise<void> {
  console.log(`=== 1. Store location and lifecycle (B2.1) ===`);
  console.log(`  default path: ${secretsPath()}`);
  check(
    'the default path hangs off the repo root, not the cwd',
    secretsPath().endsWith(path.join('secrets', 'denunciante.json')) &&
      path.isAbsolute(secretsPath()),
  );
  check('no file -> secretsExist false', !secretsExist(tmpPath));
  check('no file -> readSecrets returns null', readSecrets(tmpPath) === null);

  const created = createSecrets(orgId, tmpPath);
  check('createSecrets leaves the file on disk', secretsExist(tmpPath));
  check('version 2', created.version === 2, String(created.version));
  check('credentialSecret is 64-char hex', isHex32(created.credentialSecret));
  check('orgId was preserved', created.orgId === orgId);
  check('leafIndex starts at null', created.leafIndex === null);
  check('no reports yet', Object.keys(created.reports).length === 0);

  const mode = fs.statSync(tmpPath).mode & 0o777;
  check('file permissions = 0600', mode === 0o600, `0${mode.toString(8)}`);
  const dirMode = fs.statSync(path.dirname(tmpPath)).mode & 0o777;
  check('directory permissions = 0700', dirMode === 0o700, `0${dirMode.toString(8)}`);

  console.log('\n=== 2. Re-read and entropy ===');
  const reread = readSecrets(tmpPath);
  check('re-read is not null', reread !== null);
  check(
    'exact round-trip',
    reread !== null &&
      reread.credentialSecret === created.credentialSecret &&
      reread.orgId === created.orgId &&
      reread.leafIndex === created.leafIndex,
  );

  const otherPath = path.join(tmpDir, 'other', 'denunciante.json');
  const other = createSecrets(orgId, otherPath);
  check(
    'two credentials -> distinct secrets (randomBytes, no derivation)',
    other.credentialSecret !== created.credentialSecret,
  );

  console.log('\n=== 3. leafIndex and report registry ===');
  const withLeaf = setLeafIndex(3, tmpPath);
  check('setLeafIndex persists', withLeaf.leafIndex === 3);
  check('and survives a re-read', readSecrets(tmpPath)?.leafIndex === 3);

  // A report cycle as B3 will do it: FRESH secret per report.
  const reportSecret1 = newReportSecret();
  const reportSecret2 = newReportSecret();
  check(
    'each report receives a distinct secret (H-3: never a global one)',
    toHex(reportSecret1) !== toHex(reportSecret2),
  );

  const evHash1 = hashEvidenceBytes(Buffer.from('internal file 2026'));
  const reportId1 = randomBytes32(); // in B3 it comes from pureCircuits.reportIdOf
  const period1 = currentEpoch();

  addReport(
    reportId1,
    { reportSecret: reportSecret1, evidenceHash: evHash1, period: period1 },
    tmpPath,
  );
  const read1 = getReport(reportId1, tmpPath);
  check('the report is retrievable by reportId', read1 !== null);
  check(
    'reportSecret round-trip',
    read1?.reportSecret === toHex(reportSecret1),
  );
  check('evidenceHash round-trip', read1?.evidenceHash === toHex(evHash1));
  check(
    'period round-trip as bigint (does not break JSON.stringify)',
    read1 !== null && periodOfRecord(read1) === period1,
    `period=${period1}`,
  );
  check('a lookup for a nonexistent report -> null', getReport(randomBytes32(), tmpPath) === null);

  addReport(
    randomBytes32(),
    { reportSecret: reportSecret2, evidenceHash: hashEvidenceBytes(Buffer.from('another')) },
    tmpPath,
  );
  check('listReports returns the 2', listReports(tmpPath).length === 2);

  // Idempotence and overwrite protection.
  addReport(
    reportId1,
    { reportSecret: reportSecret1, evidenceHash: evHash1, period: period1 },
    tmpPath,
  );
  check('re-registering the same values is idempotent', listReports(tmpPath).length === 2);
  checkRejects(
    'overwriting a report with another secret is rejected (it would be unrecoverable)',
    () =>
      addReport(
        reportId1,
        { reportSecret: reportSecret2, evidenceHash: evHash1 },
        tmpPath,
      ),
    'already registered with different secrets',
  );

  console.log('\n=== 4. The file on disk has the frozen §3.2 format ===');
  const onDisk: unknown = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
  const keys = Object.keys(onDisk as object).sort();
  check(
    'exact top-level keys',
    JSON.stringify(keys) ===
      JSON.stringify(['credentialSecret', 'leafIndex', 'orgId', 'reports', 'version']),
    keys.join(','),
  );
  check(
    'there is NO global personalSecret (the insecure v1 format, H-3)',
    !Object.prototype.hasOwnProperty.call(onDisk, 'personalSecret'),
  );

  console.log('\n=== 5. Failing closed on corrupt secrets ===');
  const v1Path = path.join(tmpDir, 'v1', 'denunciante.json');
  fs.mkdirSync(path.dirname(v1Path), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    v1Path,
    JSON.stringify({ version: 1, personalSecret: toHex(randomBytes32()) }),
    { mode: 0o600 },
  );
  checkRejects('a v1 store is not read silently', () => readSecrets(v1Path), 'version 1');

  const brokenPath = path.join(tmpDir, 'broken', 'denunciante.json');
  fs.mkdirSync(path.dirname(brokenPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(brokenPath, '{ not json', { mode: 0o600 });
  checkRejects('unreadable JSON is reported', () => readSecrets(brokenPath), 'unreadable JSON');

  const fieldPath = path.join(tmpDir, 'field', 'denunciante.json');
  fs.mkdirSync(path.dirname(fieldPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    fieldPath,
    JSON.stringify({
      version: 2,
      credentialSecret: 'ZZ',
      orgId,
      leafIndex: null,
      reports: {},
    }),
    { mode: 0o600 },
  );
  checkRejects(
    'an invalid hex is caught on read, not inside the circuit',
    () => readSecrets(fieldPath),
    'credentialSecret',
  );
  check(
    'the error is of type CorruptSecretsError',
    (() => {
      try {
        readSecrets(fieldPath);
        return false;
      } catch (e) {
        return e instanceof CorruptSecretsError;
      }
    })(),
  );

  console.log('\n=== 6. Lax permissions are fixed on read ===');
  fs.chmodSync(tmpPath, 0o644);
  readSecrets(tmpPath);
  check(
    'a 0644 file goes back to 0600',
    (fs.statSync(tmpPath).mode & 0o777) === 0o600,
  );

  console.log('\n=== 7. Evidence hashing (B2.2) ===');
  const evidencePath = path.join(tmpDir, 'evidence.txt');
  fs.writeFileSync(evidencePath, 'abc');
  // Known sha-256("abc") vector — published, not computed by this code: if
  // anyone ever changes the algorithm, this check catches it.
  const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const h1 = await hashEvidenceFile(evidencePath);
  check('sha-256 of a known file matches the public vector', toHex(h1) === SHA256_ABC, toHex(h1));
  check('the digest is 32 bytes', h1.length === 32);

  const h2 = await hashEvidenceFile(evidencePath);
  check('deterministic: same file -> same hash', toHex(h1) === toHex(h2));

  const copyPath = path.join(tmpDir, 'copy-with-another-name.txt');
  fs.writeFileSync(copyPath, 'abc');
  check(
    'the file name does not enter the hash',
    toHex(await hashEvidenceFile(copyPath)) === SHA256_ABC,
  );
  check(
    'hashEvidenceBytes matches hashEvidenceFile',
    toHex(hashEvidenceBytes(Buffer.from('abc'))) === SHA256_ABC,
  );

  // Large file: streaming must not change the result.
  const large = Buffer.alloc(3 * 1024 * 1024, 7);
  const largePath = path.join(tmpDir, 'large.bin');
  fs.writeFileSync(largePath, large);
  check(
    'a 3 MB file hashes the same via stream as in memory',
    toHex(await hashEvidenceFile(largePath)) === toHex(hashEvidenceBytes(large)),
  );

  const summary1 = await evidenceSummary(evidencePath);
  check('evidenceSummary reports local name and size', summary1.name === 'evidence.txt' && summary1.bytes === 3);
  check('evidenceSummary.hashHex matches', summary1.hashHex === SHA256_ABC);

  await checkRejectsAsync(
    'a nonexistent file rejects with a readable error',
    () => hashEvidenceFile(path.join(tmpDir, 'does-not-exist.pdf')),
    'could not read the evidence',
  );

  console.log('\n=== 8. Epochs (period: Uint<64> -> bigint) ===');
  check('epoch duration = 86400 s', EPOCH_DURATION_SEC === 86400n);
  check('epochOfSeconds(0) = 0', epochOfSeconds(0) === 0n);
  check('epochOfSeconds(86399) = 0', epochOfSeconds(86399) === 0n);
  check('epochOfSeconds(86400) = 1', epochOfSeconds(86400) === 1n);
  check('epochStart(1) = 86400', epochStart(1n) === 86400n);
  check('epochEnd(1) = 172800', epochEnd(1n) === 172800n);
  const now = currentEpoch();
  check(
    'the current epoch falls inside its own window',
    epochStart(now) <= BigInt(Math.floor(Date.now() / 1000)) &&
      BigInt(Math.floor(Date.now() / 1000)) < epochEnd(now),
    `epoch=${now}`,
  );
  check(
    'the current epoch is plausible (> 20000 days since 1970, < year 2100)',
    now > 20000n && now < 47500n,
    `epoch=${now} — if this fails, someone passed milliseconds`,
  );
  check('period serializes as decimal', periodToJson(19945n) === '19945');
  check('and deserializes to bigint', periodFromJson('19945') === 19945n);
  checkRejects('a non-numeric period is rejected', () => periodFromJson('19945.0'), 'not a valid period');

  console.log('\n=== 9. Hex <-> bytes conversion ===');
  const bytes = randomBytes32();
  check('round-trip bytes -> hex -> bytes', toHex(toBytes32(toHex(bytes))) === toHex(bytes));
  check('toHex produces 64 chars', toHex(bytes).length === 64);
  checkRejects('short hex is rejected', () => toBytes32('abcd'), 'not a valid Hex32');
  checkRejects(
    'hex with invalid characters is rejected (Buffer.from would silently truncate)',
    () => toBytes32(`zz${'0'.repeat(62)}`),
    'not a valid Hex32',
  );
  checkRejects('uppercase hex is rejected (canonical format)', () => toBytes32('A'.repeat(64)), 'not a valid Hex32');
}

main()
  .then(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    summary('selftest secrets + evidence');
  })
  .catch((e: unknown) => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.error('\nselftest aborted:', e);
    process.exit(1);
  });
