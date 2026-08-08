/**
 * Explorer preview — reads the REAL Midnight Preview indexer via GraphQL.
 *
 * Zero wallet, zero proof server, zero seeds: the indexer is public.
 *
 * When `PREVIEW_CONTRACT_ADDRESS` is null (contract not deployed yet),
 * the `conectar` factory returns null and the Explorer falls back to
 * `ClienteMock`.
 *
 * State deserialization uses simple hex checking for `verificarAutoria()`
 * and raw data presence for `leerEstadoLedger()`. Full deserialization
 * requires the compiled contract module + WASM runtime; when that is
 * wired, a single dynamic import of `@contracts/contract/index.js`
 * replaces the hex checks below.
 */
import {
  authorshipOf,
  type Hex32,
} from "../cripto";
import type {
  EstadoLedger,
  ExportLlaveAutoria,
  TestigoClient,
  TxResult,
} from "../tipos";
import {
  PREVIEW_ENDPOINTS,
  PREVIEW_CONTRACT_ADDRESS,
} from "./previewConfig";

type IndexerResponse = {
  data?: { contractAction?: { state: string } | null };
  errors?: Array<{ message: string }>;
};

export class PreviewExplorerReader implements TestigoClient {
  private cachedState: string | null = null;
  private lastFetch = 0;
  private readonly TTL = 2; // minutes

  constructor(
    readonly contractAddress: string,
  ) {}

  private async fetchStateHex(): Promise<string> {
    const now = Date.now();
    if (this.cachedState && (now - this.lastFetch) < this.TTL * 60_000) {
      return this.cachedState;
    }
    const res = await fetch(PREVIEW_ENDPOINTS.indexer, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query LATEST_STATE($address: HexEncoded!) {
            contractAction(address: $address) { state }
          }
        `,
        variables: { address: this.contractAddress },
      }),
    });
    const payload: IndexerResponse = await res.json();
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).join("; "));
    }
    const raw = payload.data?.contractAction?.state;
    if (!raw) {
      throw new Error(
        `No state for contract ${this.contractAddress} on Preview indexer. ` +
        "Deploy the contract first: npm run deploy --workspace=app",
      );
    }
    this.cachedState = typeof raw === "string" ? raw : JSON.stringify(raw);
    this.lastFetch = now;
    return this.cachedState;
  }

  /**
   * Simple hex check: is the hash in the serialized ledger blob?
   *
   * Not as robust as full deserialization, but works for the demo:
   * the 32-byte hashes stored on-chain are visible in the state hex.
   */
  private hexInState(hash: Hex32): boolean {
    if (!this.cachedState) return false;
    const needle = hash.startsWith("0x") ? hash.slice(2).toLowerCase() : hash.toLowerCase();
    return this.cachedState.toLowerCase().includes(needle);
  }

  async leerEstadoLedger(): Promise<EstadoLedger> {
    await this.fetchStateHex();
    // Full deserialization requires the compiled contract module.
    // For now, return a minimal summary — the Explorers's fixture data
    // serves as the visual demo; this confirms the connection is live.
    return {
      organizaciones: 1,
      denuncias: [],
      nullifiers: 0,
      autorias: [],
    };
  }

  async verificarAutoria(p: ExportLlaveAutoria): Promise<{ ok: boolean; enLedger: boolean }> {
    if (p.version !== 2) return { ok: false, enLedger: false };
    await this.fetchStateHex();
    // Mock/production: proof must match autoriaHash, and autoriaHash must be on ledger.
    const ok = p.proof === p.autoriaHash;
    const enLedger = this.hexInState(p.autoriaHash);
    return { ok, enLedger };
  }

  // ── Read-only: these circuits require a wallet + proof server ──────────

  registrarOrganizacion(): Promise<TxResult> {
    throw new Error("El Explorer es read-only: no puede registrar organizaciones.");
  }

  emitirCredencial(): Promise<{ hojaIndex: number; tx: TxResult }> {
    throw new Error("El Explorer es read-only: no puede emitir credenciales.");
  }

  denunciar(): Promise<{ denunciaId: Hex32; nullifier: Hex32; tx: TxResult }> {
    throw new Error("El Explorer es read-only: no puede denunciar.");
  }

  revelarAutoria(): Promise<{ autoriaHash: Hex32; tx: TxResult }> {
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
