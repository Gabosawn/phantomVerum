/**
 * The `contract` backend — compiled `.compact` via `@midnight-ntwrk/compact-runtime`
 * local simulator. No network, no proof server.
 *
 * Pattern mirrors `contracts/test/harness.mjs` and `app/src/api/ejecutor-simulador.ts`.
 */

import { pathToFileURL } from "node:url";

import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import type { ChargedState, CircuitContext } from "@midnight-ntwrk/compact-runtime";

import { ASSERTS, AHORA } from "./contract-surface.js";
import { bytesToHex, hexToBytes } from "./crypto.js";
import { AssertError } from "./types.js";
import type { Actor, Hex32, LedgerSnapshot, TestigoHarness } from "./types.js";
import { privateStateFor, witnesses } from "./witnesses.js";
import type { TestigoPrivateState } from "./witnesses.js";

type PS = TestigoPrivateState;

interface CircuitResult {
  readonly context: CircuitContext<PS>;
}

interface GeneratedModule {
  Contract: new (w: typeof witnesses) => {
    initialState(ctx: unknown): {
      currentContractState: ChargedState;
      currentPrivateState: PS;
      currentZswapLocalState: CircuitContext<PS>["currentZswapLocalState"];
    };
    impureCircuits: Record<string, (ctx: CircuitContext<PS>, ...args: never[]) => CircuitResult>;
  };
  ledger(state: ChargedState): GeneratedLedger;
}

interface GeneratedLedger {
  organizaciones: {
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>;
  };
  credenciales: {
    root(): { field?: bigint; value?: Uint8Array[] };
    firstFree(): bigint;
  };
  denuncias: { [Symbol.iterator](): Iterator<Uint8Array> };
  nullifiers: { [Symbol.iterator](): Iterator<Uint8Array> };
  autorias: { [Symbol.iterator](): Iterator<Uint8Array> };
}

const EMPTY_PRIVATE_STATE: PS = privateStateFor(
  {
    credencialSecret: "00".repeat(32),
    secretPersonal: "00".repeat(32),
    evidenciaHash: "00".repeat(32),
  },
  "00".repeat(32),
);

const COIN_PUBLIC_KEY = "0".repeat(64);
const KNOWN_ASSERTS = Object.values(ASSERTS);

export async function loadGeneratedModule(contractPath: string): Promise<GeneratedModule> {
  return (await import(pathToFileURL(contractPath).href)) as GeneratedModule;
}

export class SimulatorHarness implements TestigoHarness {
  readonly backend = "contract" as const;

  private readonly mod: GeneratedModule;
  private readonly contract: InstanceType<GeneratedModule["Contract"]>;
  private readonly address: string;

  private estadoContrato: ChargedState;
  private zswap: CircuitContext<PS>["currentZswapLocalState"];
  private ps: PS;
  private clock = AHORA;
  private actor: Actor | undefined;

  constructor(mod: GeneratedModule) {
    this.mod = mod;
    this.contract = new this.mod.Contract(witnesses);
    this.address = sampleContractAddress();
    this.ps = EMPTY_PRIVATE_STATE;

    const initial = this.contract.initialState(
      createConstructorContext(EMPTY_PRIVATE_STATE, COIN_PUBLIC_KEY),
    );
    this.estadoContrato = initial.currentContractState;
    this.zswap = initial.currentZswapLocalState;
  }

  as(actor: Actor): this {
    this.actor = actor;
    this.ps = privateStateFor(actor, bytesToHex(this.ps.orgId));
    return this;
  }

  at(unixSeconds: number): this {
    this.clock = unixSeconds;
    return this;
  }

  private contexto(): CircuitContext<PS> {
    return createCircuitContext<PS>(
      this.address,
      this.zswap,
      this.estadoContrato,
      this.ps,
      undefined,
      undefined,
      this.clock,
    );
  }

  private call(circuit: string, ...args: unknown[]): void {
    const fn = this.contract.impureCircuits[circuit];
    if (fn === undefined) {
      throw new Error(
        `contract backend: the compiled contract has no circuit "${circuit}". ` +
          `Reconcile tests/src/harness/contract-surface.ts with Block A.`,
      );
    }
    try {
      const result = fn(this.contexto(), ...(args as never[]));
      this.estadoContrato = result.context.currentQueryContext.state as ChargedState;
      this.zswap = result.context.currentZswapLocalState;
      this.ps = result.context.currentPrivateState;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const known = KNOWN_ASSERTS.find((m) => message.includes(m));
      throw known !== undefined ? new AssertError(known) : cause;
    }
  }

  registrarOrganizacion(orgId: Hex32, ancla: Hex32): void {
    this.call("registrarOrganizacion", hexToBytes(orgId), hexToBytes(ancla));
  }

  emitirCredencial(orgId: Hex32, credCommitment: Hex32): void {
    this.call("emitirCredencial", hexToBytes(orgId), hexToBytes(credCommitment));
  }

  denunciar(orgId: Hex32, periodo: bigint): void {
    if (this.actor === undefined) {
      throw new Error("harness: call .as(actor) before denunciar");
    }
    this.ps = privateStateFor(this.actor, orgId);
    this.call("denunciar", hexToBytes(orgId), periodo);
  }

  revelarAutoria(denunciaId: Hex32, fiscalPk: Hex32): void {
    if (this.actor === undefined) {
      throw new Error("harness: call .as(actor) before revelarAutoria");
    }
    this.ps = privateStateFor(this.actor, bytesToHex(this.ps.orgId));
    this.call("revelarAutoria", hexToBytes(denunciaId), hexToBytes(fiscalPk));
  }

  ledger(): LedgerSnapshot {
    const l = this.mod.ledger(this.estadoContrato);

    const organizaciones = new Map<Hex32, Hex32>();
    for (const [k, v] of l.organizaciones) {
      organizaciones.set(bytesToHex(k), bytesToHex(v));
    }

    const hexSet = (it: Iterable<Uint8Array>): Set<Hex32> => {
      const out = new Set<Hex32>();
      for (const v of it) out.add(bytesToHex(v));
      return out;
    };

    return {
      organizaciones,
      credencialesRoot: this.readRoot(l),
      credencialesCount: Number(l.credenciales.firstFree()),
      denuncias: hexSet(l.denuncias),
      nullifiers: hexSet(l.nullifiers),
      autorias: hexSet(l.autorias),
    };
  }

  private readRoot(l: GeneratedLedger): Hex32 | null {
    try {
      const root = l.credenciales.root();
      if (root.value?.[0] !== undefined) return bytesToHex(root.value[0]);
      if (root.field !== undefined) {
        // HistoricMerkleTree ledger wrapper exposes digest as Field.
        const out = new Uint8Array(32);
        let x = root.field;
        for (let i = 0; i < 32; i++) {
          out[i] = Number(x & 0xffn);
          x >>= 8n;
        }
        return bytesToHex(out);
      }
      return null;
    } catch {
      return null;
    }
  }
}
