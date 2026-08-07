/**
 * The `contract` backend — the real compiled `testigo.compact` driven through
 * `@midnight-ntwrk/compact-runtime`'s local simulator. No network, no proof server, no
 * proving keys (so `compile:fast` is enough).
 *
 * All shapes here are verified against `contracts/output/contract/index.d.ts`.
 */

import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import type { CircuitContext, MerkleTreeDigest, MerkleTreePath } from "@midnight-ntwrk/compact-runtime";

import { ASSERTS } from "./contract-surface.js";
import { bytesToHex, hexToBytes, padHex32 } from "./crypto.js";
import { COMPILED_CONTRACT } from "./index.js";
import { AssertError } from "./types.js";
import type { Actor, Hex32, LedgerSnapshot, TestigoHarness } from "./types.js";
import { privateStateFor, witnesses } from "./witnesses.js";
import type { TestigoPrivateState } from "./witnesses.js";

type PS = TestigoPrivateState;

/** The generated module's surface, narrowed to what this harness uses. */
export interface GeneratedModule {
  Contract: new (w: typeof witnesses) => GeneratedContract;
  ledger(state: unknown): GeneratedLedger;
  pureCircuits: {
    leafOf(orgId: Uint8Array, credSecret: Uint8Array): Uint8Array;
    reportIdOf(ev: Uint8Array, sec: Uint8Array): Uint8Array;
    nullifierOf(sec: Uint8Array, orgId: Uint8Array, period: Uint8Array): Uint8Array;
    authorshipOf(sec: Uint8Array, reportId: Uint8Array, prosecutorPk: Uint8Array): Uint8Array;
  };
}

interface GeneratedContract {
  initialState(ctx: unknown): {
    currentContractState: unknown;
    currentPrivateState: PS;
    currentZswapLocalState: unknown;
  };
  impureCircuits: Record<
    string,
    (ctx: CircuitContext<PS>, ...args: never[]) => { context: CircuitContext<PS> }
  >;
}

interface CountedSet {
  size(): bigint;
  [Symbol.iterator](): Iterator<Uint8Array>;
}

interface GeneratedLedger {
  organizations: { size(): bigint; [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]> };
  credentials: {
    root(): MerkleTreeDigest;
    firstFree(): bigint;
    findPathForLeaf(leaf: Uint8Array): MerkleTreePath<Uint8Array> | undefined;
  };
  reports: CountedSet;
  nullifiers: CountedSet;
  authorships: CountedSet;
}

/** Imports the compiled contract. Separate from the class so `backends()` can await it once. */
export async function loadContract(): Promise<GeneratedModule> {
  const url = new URL(`file://${COMPILED_CONTRACT}`).href;
  return (await import(url)) as unknown as GeneratedModule;
}

/** The private state the constructor runs with. Replaced per-actor by `.as()`. */
const EMPTY_PRIVATE_STATE: PS = {
  orgId: new Uint8Array(32),
  credentialSecret: new Uint8Array(32),
  personalSecret: new Uint8Array(32),
  evidenceHash: new Uint8Array(32),
  orgIdHex: "00".repeat(32),
  credentialSecretHex: "00".repeat(32),
};

const COIN_PUBLIC_KEY = "0".repeat(64);

/** Every contract assert, so a runtime failure can be recognised and re-thrown cleanly. */
const KNOWN_ASSERTS = Object.values(ASSERTS);

export class SimulatorHarness implements TestigoHarness {
  readonly backend = "contract" as const;

  private readonly contract: GeneratedContract;
  private ctx: CircuitContext<PS>;

  constructor(private readonly mod: GeneratedModule) {
    this.contract = new mod.Contract(witnesses);

    const initial = this.contract.initialState(
      createConstructorContext(EMPTY_PRIVATE_STATE, COIN_PUBLIC_KEY),
    );

    this.ctx = createCircuitContext<PS>(
      sampleContractAddress(),
      initial.currentZswapLocalState as never,
      initial.currentContractState as never,
      initial.currentPrivateState,
    );
  }

  as(actor: Actor): this {
    this.ctx = { ...this.ctx, currentPrivateState: privateStateFor(actor) };
    return this;
  }

  /**
   * Runs a circuit and advances the context.
   *
   * A failed `assert` inside the circuit surfaces as a runtime throw from generated code. It is
   * normalised to `AssertError` with the message preserved, so `toThrow(/…/)` matches
   * identically on both backends — that is what lets one suite cover both.
   */
  private call(circuit: string, ...args: unknown[]): void {
    const fn = this.contract.impureCircuits[circuit];
    if (fn === undefined) {
      throw new Error(
        `contract backend: the compiled contract has no circuit "${circuit}". ` +
          "Surface drifted — reconcile tests/src/harness/contract-surface.ts with the .compact.",
      );
    }
    try {
      this.ctx = fn(this.ctx, ...(args as never[])).context;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const known = KNOWN_ASSERTS.find((m) => message.includes(m));
      throw known !== undefined ? new AssertError(known) : cause;
    }
  }

  registerOrganization(orgId: Hex32, anchor: Hex32): void {
    this.call("registerOrganization", hexToBytes(orgId), hexToBytes(anchor));
  }

  issueCredential(orgId: Hex32, leaf: Hex32): void {
    this.call("issueCredential", hexToBytes(orgId), hexToBytes(leaf));
  }

  report(orgId: Hex32, period: string): void {
    this.call("report", hexToBytes(orgId), hexToBytes(padHex32(period)));
  }

  revealAuthorship(reportId: Hex32, prosecutorPk: Hex32): void {
    this.call("revealAuthorship", hexToBytes(reportId), hexToBytes(prosecutorPk));
  }

  ledger(): LedgerSnapshot {
    const l = this.mod.ledger(this.ctx.currentQueryContext.state);

    const organizations = new Map<Hex32, Hex32>();
    for (const [k, v] of l.organizations) organizations.set(bytesToHex(k), bytesToHex(v));

    const hexSet = (it: Iterable<Uint8Array>): Set<Hex32> => {
      const out = new Set<Hex32>();
      for (const v of it) out.add(bytesToHex(v));
      return out;
    };

    return {
      organizations,
      credentialsCount: Number(l.credentials.firstFree()),
      reports: hexSet(l.reports),
      nullifiers: hexSet(l.nullifiers),
      authorships: hexSet(l.authorships),
    };
  }

  /** The contract's pure circuits, so tests can compare them against `crypto.ts`. */
  pureCircuits(): GeneratedModule["pureCircuits"] {
    return this.mod.pureCircuits;
  }
}
