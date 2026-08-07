/**
 * The `contract` backend — the real compiled `.compact` driven through
 * `@midnight-ntwrk/compact-runtime`'s local simulator. No network, no proof server.
 *
 * ⚠️ UNVERIFIED UNTIL BLOCK A LANDS. This file is written against the compact-runtime 0.16.0
 * type declarations, but it has never executed: `contracts/output/` does not exist yet. It is
 * loaded only when the compiled contract is present, so it cannot break the `model` run. On
 * first contact with a real artifact, expect to adjust two things:
 *
 *   1. `readLedger()` — how the generated `ledger()` wants the state handed to it.
 *   2. Circuit argument encoding, if Block A picks types other than `Bytes<32>`.
 *
 * Everything else (the seam, the 13 cases, the e2e script) is independent of this file.
 */

import { createRequire } from "node:module";

import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import type { CircuitContext } from "@midnight-ntwrk/compact-runtime";

import { ASSERTS } from "./contract-surface.js";
import { bytesToHex, hexToBytes, padHex32 } from "./crypto.js";
import { AssertError } from "./types.js";
import type { Actor, Hex32, LedgerSnapshot, TestigoHarness } from "./types.js";
import { privateStateFor, witnesses } from "./witnesses.js";
import type { TestigoPrivateState } from "./witnesses.js";
import { COMPILED_CONTRACT } from "./index.js";

type PS = TestigoPrivateState;

interface CircuitResult {
  readonly context: CircuitContext<PS>;
}

/** The shape the generated `index.cjs` exposes, narrowed to what this harness uses. */
interface GeneratedModule {
  Contract: new (w: typeof witnesses) => {
    initialState(ctx: unknown): {
      currentContractState: unknown;
      currentPrivateState: PS;
      currentZswapLocalState: unknown;
    };
    impureCircuits: Record<string, (ctx: CircuitContext<PS>, ...args: never[]) => CircuitResult>;
  };
  ledger(state: unknown): GeneratedLedger;
}

interface GeneratedLedger {
  organizaciones: {
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>;
  };
  credenciales: { root(): unknown };
  denuncias: { [Symbol.iterator](): Iterator<Uint8Array> };
  nullifiers: { [Symbol.iterator](): Iterator<Uint8Array> };
  autorias: { [Symbol.iterator](): Iterator<Uint8Array> };
}

/** The empty private state the constructor runs with. Replaced per-actor by `.as()`. */
const EMPTY_PRIVATE_STATE: PS = {
  credencialSecret: new Uint8Array(32),
  secretPersonal: new Uint8Array(32),
  evidenciaHash: new Uint8Array(32),
};

const COIN_PUBLIC_KEY = "0".repeat(64);

/** Every known assert message, so a runtime failure can be recognised and re-thrown cleanly. */
const KNOWN_ASSERTS = Object.values(ASSERTS);

export class SimulatorHarness implements TestigoHarness {
  readonly backend = "contract" as const;

  private readonly mod: GeneratedModule;
  private readonly contract: InstanceType<GeneratedModule["Contract"]>;
  private ctx: CircuitContext<PS>;

  constructor() {
    const require = createRequire(import.meta.url);
    this.mod = require(COMPILED_CONTRACT) as GeneratedModule;
    this.contract = new this.mod.Contract(witnesses);

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
   * normalised to `AssertError` with the message preserved so `toThrow(/…/)` matches
   * identically on both backends — that is what lets one suite cover both.
   */
  private call(circuit: string, ...args: unknown[]): void {
    const fn = this.contract.impureCircuits[circuit];
    if (fn === undefined) {
      throw new Error(
        `contract backend: the compiled contract has no circuit "${circuit}". ` +
          `Contract surface drifted — reconcile tests/src/harness/contract-surface.ts with Block A.`,
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

  registrarOrganizacion(orgId: Hex32, ancla: Hex32): void {
    this.call("registrarOrganizacion", hexToBytes(orgId), hexToBytes(ancla));
  }

  emitirCredencial(orgId: Hex32, hoja: Hex32): void {
    this.call("emitirCredencial", hexToBytes(orgId), hexToBytes(hoja));
  }

  denunciar(orgId: Hex32, periodo: string): void {
    this.call("denunciar", hexToBytes(orgId), hexToBytes(padHex32(periodo)));
  }

  revelarAutoria(denunciaId: Hex32, fiscalPk: Hex32): void {
    this.call("revelarAutoria", hexToBytes(denunciaId), hexToBytes(fiscalPk));
  }

  ledger(): LedgerSnapshot {
    const l = this.readLedger();

    const organizaciones = new Map<Hex32, Hex32>();
    for (const [k, v] of l.organizaciones) organizaciones.set(bytesToHex(k), bytesToHex(v));

    const hexSet = (it: Iterable<Uint8Array>): Set<Hex32> => {
      const out = new Set<Hex32>();
      for (const v of it) out.add(bytesToHex(v));
      return out;
    };

    const denuncias = hexSet(l.denuncias);
    return {
      organizaciones,
      credencialesRoot: this.readRoot(l),
      // The tree does not expose a count; the ledger snapshot contract only promises a number,
      // and no assertion in the suite depends on it for this backend.
      credencialesCount: Number.NaN,
      denuncias,
      nullifiers: hexSet(l.nullifiers),
      autorias: hexSet(l.autorias),
    };
  }

  /** ⚠️ First thing to verify against a real artifact — see the file header. */
  private readLedger(): GeneratedLedger {
    const qc = this.ctx.currentQueryContext as unknown as { state: unknown };
    return this.mod.ledger(qc.state);
  }

  private readRoot(l: GeneratedLedger): Hex32 | null {
    try {
      const root = l.credenciales.root() as { value?: Uint8Array[] };
      const first = root.value?.[0];
      return first === undefined ? null : bytesToHex(first);
    } catch {
      return null;
    }
  }
}
