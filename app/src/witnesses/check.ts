// Mini assert framework for the `witnesses/` selftests.
//
// Deliberately tiny: the selftests must be able to run with
// `node app/dist/witnesses/<script>.js`, without vitest or any runner, so
// they serve as reproducible evidence even while the rest of the toolchain is
// half-assembled. The project's formal suite lives in `tests/` (block D).
//
// Same output format as `contracts/test/harness.mjs`, so both read the same
// in the terminal during the demo.

let run = 0;
let failures = 0;

export function check(name: string, cond: boolean, detail = ''): void {
  run++;
  if (cond) console.log(`  ok    ${name}${detail ? ` (${detail})` : ''}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ''}`);
  }
}

/** Expects `fn` to throw with a message containing `fragment`. */
export function checkRejects(name: string, fn: () => unknown, fragment: string): void {
  run++;
  try {
    fn();
    failures++;
    console.log(`  FAIL  ${name} -> did not throw (expected "${fragment}")`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(fragment)) {
      failures++;
      console.log(`  FAIL  ${name} -> threw "${msg}", expected "${fragment}"`);
    } else {
      console.log(`  ok    ${name} -> rejected: ${msg.split('\n')[0]}`);
    }
  }
}

/** Same as `checkRejects` for promises. */
export async function checkRejectsAsync(
  name: string,
  fn: () => Promise<unknown>,
  fragment: string,
): Promise<void> {
  run++;
  try {
    await fn();
    failures++;
    console.log(`  FAIL  ${name} -> did not throw (expected "${fragment}")`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(fragment)) {
      failures++;
      console.log(`  FAIL  ${name} -> threw "${msg}", expected "${fragment}"`);
    } else {
      console.log(`  ok    ${name} -> rejected: ${msg.split('\n')[0]}`);
    }
  }
}

/** Returns the message of the error thrown by `fn`, or null if it did not throw. */
export function errorMessage(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Prints the summary and exits the process with code 0/1. */
export function summary(title: string): never {
  console.log(
    `\n=== ${title}: ${run - failures}/${run} ${failures === 0 ? 'OK' : `— ${failures} FAILURES`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
