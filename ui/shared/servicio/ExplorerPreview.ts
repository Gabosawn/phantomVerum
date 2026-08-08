/**
 * Explorer preview — reads the REAL Midnight Preview ledger via GraphQL.
 *
 * Zero wallet, zero proof server, zero seeds: the indexer is public and its
 * CORS is open, so this is a plain `fetch` from the browser.
 *
 * The state that comes back is DESERIALIZED with the compiler-generated
 * module, exactly as `app/src/api/ledger.ts` does on the Node side:
 * `ContractState.deserialize(bytes)` then `ledger(state.data)`. That gives
 * the real typed sets — `reports`, `nullifiers`, `authorships` — instead of
 * the substring probe this file used to run against the raw state hex.
 *
 * Why that mattered, and not only for tidiness: `hexInState` answered "is
 * this 32-byte string somewhere in the blob", which is not the same question
 * as "is it a member of `authorships`". It would say yes for a value that
 * landed in some other field, and it could not tell an empty ledger from an
 * unreachable one. `authorships.member()` is the question the verdict claims
 * to be answering.
 *
 * When `PREVIEW_CONTRACT_ADDRESS` is null (nothing deployed yet), the
 * `conectar` factory returns null and the Explorer falls back to
 * `ClienteMock`.
 */
import { ContractState } from "@midnight-ntwrk/compact-runtime";

import { ledger as leerLedger } from "@contracts/contract/index.js";

import { aHex, deHex, receiptOf, type Hex32 } from "../cripto";
import type {
  EstadoLedger,
  ExportLlaveAutoria,
  ResultadoVerificacion,
  TestigoClient,
  TxResult,
} from "../tipos";
import { PREVIEW_ENDPOINTS, PREVIEW_CONTRACT_ADDRESS } from "./previewConfig";

type IndexerResponse = {
  data?: {
    contractAction?: {
      state: string;
      transaction?: { block?: { height?: number } | null } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

/** The shape `ledger()` returns. Only the parts this reader touches. */
type LedgerLeido = {
  organizations: { size(): bigint };
  credentials: { firstFree(): bigint };
  reports: { size(): bigint; [Symbol.iterator](): Iterator<Uint8Array> };
  nullifiers: { size(): bigint };
  authorships: {
    size(): bigint;
    member(elem: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>;
  };
};

/** Every element of a ledger `Set`, as Hex32. Mirrors `asHexes` in app/. */
function todos(set: { [Symbol.iterator](): Iterator<Uint8Array> }): Hex32[] {
  const out: Hex32[] = [];
  const it = set[Symbol.iterator]();
  for (let r = it.next(); r.done !== true; r = it.next()) {
    out.push(aHex(r.value));
  }
  return out;
}

export class PreviewExplorerReader implements TestigoClient {
  private cache: { ledger: LedgerLeido; t: number } | null = null;

  /**
   * Block of the last action on the contract, straight from the indexer.
   *
   * The header used to print a hardcoded height next to a "✓ preview" badge —
   * a fabricated number sitting beside a claim that the data is real. `0`
   * means "not read yet", and the header shows a dash for it rather than
   * inventing one.
   */
  private bloque = 0;

  ultimoBloque(): number {
    return this.bloque;
  }

  /**
   * Short on purpose. The old value was two MINUTES, which is longer than the
   * gap between publishing an authorship and walking to the other window to
   * verify it: the verdict would come back from a snapshot taken before the
   * transaction existed, and read as a refutation.
   */
  private readonly TTL_MS = 5_000;

  constructor(readonly contractAddress: string) {}

  /**
   * Fetches and deserializes the contract state.
   *
   * `refrescar` skips the cache. Verification always asks for fresh state:
   * one HTTP round trip is cheaper than a wrong verdict.
   */
  private async leer(refrescar = false): Promise<LedgerLeido> {
    const ahora = Date.now();
    if (!refrescar && this.cache && ahora - this.cache.t < this.TTL_MS) {
      return this.cache.ledger;
    }

    const res = await fetch(PREVIEW_ENDPOINTS.indexer, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query LATEST_STATE($address: HexEncoded!) {
            contractAction(address: $address) {
              state
              transaction { block { height } }
            }
          }
        `,
        variables: { address: this.contractAddress },
      }),
    });
    const payload: IndexerResponse = await res.json();
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).join("; "));
    }
    const accion = payload.data?.contractAction;
    const crudo = accion?.state;
    this.bloque = accion?.transaction?.block?.height ?? 0;
    if (typeof crudo !== "string" || crudo === "") {
      throw new Error(
        `El indexer no tiene estado para el contrato ${this.contractAddress}. ` +
          "Deployá primero: npm run deploy --workspace=app",
      );
    }

    // Same two steps as `ledgerFromState` in app/src/api/ledger.ts: the
    // indexer answers hex, `.data` is the ChargedState the generated
    // deserializer expects.
    const estado = ContractState.deserialize(deHex(crudo as Hex32));
    const ledger = leerLedger(estado.data) as unknown as LedgerLeido;
    this.cache = { ledger, t: ahora };
    return ledger;
  }

  async leerEstadoLedger(): Promise<EstadoLedger> {
    const l = await this.leer();
    return {
      organizaciones: Number(l.organizations.size()),
      denuncias: todos(l.reports),
      nullifiers: Number(l.nullifiers.size()),
      autorias: todos(l.authorships),
    };
  }

  /**
   * `verificadorNonce` is the nonce of WHOEVER IS VERIFYING and is a separate
   * parameter on purpose: the package carries the receipt the reporter bound
   * the proof to, and the question is whether the two agree. Drop this
   * parameter — as this reader once did — and anyone who intercepts the
   * package can self-designate, and the intruder verifies green.
   *
   * The verdict is a RECOMPUTATION, which is what makes it evidence: what
   * gets looked up on chain is `receiptOf(reportId, myNonce)`, never the
   * value declared in the package. An employer who scraped both values off
   * the public ledger and asks with their own nonce gets a different receipt,
   * and that one was published nowhere.
   */
  async verificarAutoria(
    p: ExportLlaveAutoria,
    verificadorNonce: Hex32,
  ): Promise<ResultadoVerificacion> {
    if (p.version !== 3) return { ok: false, enLedger: false };
    const l = await this.leer(true);
    const recomputado = receiptOf(p.denunciaId, verificadorNonce);
    const enLedger = l.authorships.member(deHex(recomputado));
    return { ok: recomputado === p.recibo && enLedger, enLedger };
  }

  // ── Read-only: these circuits need a wallet + proof server ──────────────

  registrarOrganizacion(): Promise<TxResult> {
    throw new Error("El Explorer es read-only: no puede registrar organizaciones.");
  }

  emitirCredencial(): Promise<{ hojaIndex: number; tx: TxResult }> {
    throw new Error("El Explorer es read-only: no puede emitir credenciales.");
  }

  denunciar(): Promise<{ denunciaId: Hex32; nullifier: Hex32; tx: TxResult }> {
    throw new Error("El Explorer es read-only: no puede denunciar.");
  }

  revelarAutoria(): Promise<{ recibo: Hex32; tx: TxResult }> {
    throw new Error("El Explorer es read-only: no puede revelar autoría.");
  }
}

/**
 * Connects to the Preview indexer for the Explorer.
 * Returns null if the contract address is not set or the indexer is unreachable.
 */
export async function conectarExplorerPreview(): Promise<PreviewExplorerReader | null> {
  if (!PREVIEW_CONTRACT_ADDRESS) return null;
  try {
    const reader = new PreviewExplorerReader(PREVIEW_CONTRACT_ADDRESS);
    await reader.leerEstadoLedger();
    return reader;
  } catch {
    return null;
  }
}
