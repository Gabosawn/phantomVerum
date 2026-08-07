/**
 * ★ El otro módulo que se reemplaza al integrar (junto con `cripto.ts`).
 *
 * Implementa la API congelada de `app/` (§3.1) contra un ledger en memoria.
 * Reproduce los asserts de `contracts/src/testigo.compact` en el mismo orden,
 * así que los casos de error de la demo — credencial ajena, doble denuncia en
 * el mismo período, secret que no es el del autor — fallan de verdad y antes
 * de "emitir" ninguna transacción, igual que fallarían en proof time.
 *
 * Lo que es GENUINO acá: todo el hasheo, todas las derivaciones y todas las
 * comparaciones. Lo que es FABRICADO: los `txId`, las alturas de bloque, los
 * tiempos de proving y la existencia misma de una cadena. El README lo dice.
 */

import {
  authorshipOf,
  hashDeArchivo,
  leafOf,
  nullifierOf,
  periodoABytes32,
  reportIdOf,
  type Hex32,
} from "../cripto";
import {
  CredencialInvalidaError,
  DenunciaRepetidaError,
  NoSosElAutorError,
  NullifierRepetidoError,
  OrganizacionYaRegistradaError,
  type EstadoLedger,
  type ExportLlaveAutoria,
  type Progreso,
  type TestigoClient,
  type TxResult,
} from "../tipos";

/** Los witnesses. En el Bloque B esto lo provee `secrets/denunciante.json`. */
export type Witnesses = {
  secretPersonal: Hex32;
  credencialSecret: Hex32;
  orgId: Hex32;
  hojaIndex: number;
  /** Se completa al denunciar o al cargar la llave de autoría. */
  evidenciaHash?: Hex32;
};

export type LedgerLocal = {
  organizaciones: Record<Hex32, Hex32>;
  credenciales: Hex32[];
  denuncias: Hex32[];
  nullifiers: Hex32[];
  autorias: Hex32[];
  altura: number;
};

export function ledgerVacio(altura = 1_284_917): LedgerLocal {
  return {
    organizaciones: {},
    credenciales: [],
    denuncias: [],
    nullifiers: [],
    autorias: [],
    altura,
  };
}

const PASOS_DENUNCIAR = [
  "witness credentialSecret() + credentialPath() → recibidos, proceso local",
  "merkleTreePathRoot(leafOf(orgId, cred)) · checkRoot contra el ancla · depth 8",
  "nullifier = H(dom:nullifier ‖ credSecret ‖ orgId ‖ periodo)",
  "reportId  = H(dom:report ‖ evidenciaHash ‖ secretPersonal)",
  "zk proof generada · 3.412 constraints",
  "tx submitted · fees shielded · sin msg.sender",
];

const PASOS_REVELAR = [
  "witness personalSecret() + evidenceHash() → recibidos, proceso local",
  "assert reportIdOf(evidenciaHash, secret) == denunciaId · ok",
  "authorship = H(dom:authorship ‖ secret ‖ denunciaId ‖ fiscalPk)",
  "zk proof generada · 1.980 constraints",
];

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type OpcionesMock = {
  /** Milisegundos por paso de proving. 0 = instantáneo (para tests). */
  ritmoMs?: number;
  ledgerInicial?: LedgerLocal;
  /** Se llama después de cada mutación, para persistir. */
  alCambiar?: (ledger: LedgerLocal) => void;
};

export class ClienteMock implements TestigoClient {
  private ledger: LedgerLocal;
  private witnesses: Witnesses | null = null;
  private readonly ritmoMs: number;
  private readonly alCambiar?: (ledger: LedgerLocal) => void;

  constructor(opciones: OpcionesMock = {}) {
    this.ledger = opciones.ledgerInicial ?? ledgerVacio();
    this.ritmoMs = opciones.ritmoMs ?? 600;
    this.alCambiar = opciones.alCambiar;
  }

  // ── Estado privado ──────────────────────────────────────────────────────

  establecerWitnesses(w: Witnesses): void {
    this.witnesses = { ...w };
  }

  obtenerWitnesses(): Witnesses | null {
    return this.witnesses ? { ...this.witnesses } : null;
  }

  instantanea(): LedgerLocal {
    return structuredClone(this.ledger);
  }

  reemplazarLedger(l: LedgerLocal): void {
    this.ledger = structuredClone(l);
  }

  private exigirWitnesses(): Witnesses {
    if (!this.witnesses) {
      throw new CredencialInvalidaError();
    }
    return this.witnesses;
  }

  private confirmar(saltoDeBloques: number): TxResult {
    this.ledger.altura += saltoDeBloques;
    const txId = txFabricado();
    this.alCambiar?.(this.ledger);
    return { txId, blockHeight: this.ledger.altura };
  }

  private async correrPasos(pasos: string[], onPaso?: Progreso): Promise<void> {
    for (const paso of pasos) {
      if (this.ritmoMs > 0) await dormir(this.ritmoMs);
      onPaso?.(paso);
    }
  }

  // ── §3.1 ────────────────────────────────────────────────────────────────

  async registrarOrganizacion(p: { orgId: Hex32; ancla: Hex32 }): Promise<TxResult> {
    // assert(!organizations.member(orgId))
    if (p.orgId in this.ledger.organizaciones) {
      throw new OrganizacionYaRegistradaError();
    }
    this.ledger.organizaciones[p.orgId] = p.ancla;
    return this.confirmar(3);
  }

  async emitirCredencial(p: {
    orgId: Hex32;
    credencialSecret?: Hex32;
  }): Promise<{ credencialSecret: Hex32; hojaIndex: number; tx: TxResult }> {
    // assert(organizations.member(orgId))
    if (!(p.orgId in this.ledger.organizaciones)) {
      throw new CredencialInvalidaError();
    }
    const credencialSecret = p.credencialSecret ?? secretAleatorio();
    const hoja = await leafOf(p.orgId, credencialSecret);
    const hojaIndex = this.ledger.credenciales.indexOf(hoja);
    if (hojaIndex === -1) this.ledger.credenciales.push(hoja);
    return {
      credencialSecret,
      hojaIndex: hojaIndex === -1 ? this.ledger.credenciales.length - 1 : hojaIndex,
      tx: this.confirmar(2),
    };
  }

  async denunciar(
    p: { orgId: Hex32; periodo: string; evidencia: Uint8Array },
    onPaso?: Progreso,
  ): Promise<{ denunciaId: Hex32; nullifier: Hex32; tx: TxResult }> {
    const w = this.exigirWitnesses();

    // El archivo se hashea acá y sólo el hash sigue viaje. Esto es real.
    const evidenciaHash = await hashDeArchivo(p.evidencia);
    const periodo = periodoABytes32(p.periodo);

    // C1 — pertenencia. En el circuito es merkleTreePathRoot + checkRoot; acá
    // es pertenencia de la hoja al set de credenciales emitidas. La semántica
    // que se demuestra es la misma: probás que sos de adentro sin decir quién.
    const hoja = await leafOf(p.orgId, w.credencialSecret);
    if (!this.ledger.credenciales.includes(hoja)) {
      throw new CredencialInvalidaError();
    }

    // C2 — el nullifier usa el secret de la CREDENCIAL, no el personal.
    const nullifier = await nullifierOf(w.credencialSecret, p.orgId, periodo);
    if (this.ledger.nullifiers.includes(nullifier)) {
      throw new NullifierRepetidoError();
    }

    const denunciaId = await reportIdOf(evidenciaHash, w.secretPersonal);
    if (this.ledger.denuncias.includes(denunciaId)) {
      throw new DenunciaRepetidaError();
    }

    // Recién acá "se emite": todo lo de arriba falla sin tocar la cadena.
    await this.correrPasos(PASOS_DENUNCIAR, onPaso);

    this.ledger.denuncias.push(denunciaId);
    this.ledger.nullifiers.push(nullifier);
    this.witnesses = { ...w, evidenciaHash };

    return { denunciaId, nullifier, tx: this.confirmar(7) };
  }

  async revelarAutoria(
    p: { denunciaId: Hex32; fiscalPk: Hex32 },
    onPaso?: Progreso,
  ): Promise<{ autoriaHash: Hex32; tx: TxResult }> {
    const w = this.exigirWitnesses();
    if (!w.evidenciaHash) {
      throw new NoSosElAutorError();
    }

    // assert(reportIdOf(ev, secret) == reportId) — sólo el autor pasa.
    const recomputado = await reportIdOf(w.evidenciaHash, w.secretPersonal);
    if (recomputado !== p.denunciaId) {
      throw new NoSosElAutorError();
    }

    await this.correrPasos(PASOS_REVELAR, onPaso);

    const autoriaHash = await authorshipOf(w.secretPersonal, p.denunciaId, p.fiscalPk);
    if (!this.ledger.autorias.includes(autoriaHash)) {
      this.ledger.autorias.push(autoriaHash);
    }

    return { autoriaHash, tx: this.confirmar(4) };
  }

  /**
   * 100 % off-chain y sin proof server: se recomputa el hash de autoría con la
   * clave del verificador y se compara. Éste es el corazón del designated
   * verifier — con otra clave da otro hash, y no hay nada que hacer al respecto.
   */
  async verificarAutoria(p: ExportLlaveAutoria): Promise<{ ok: boolean; enLedger: boolean }> {
    const recomputado = await authorshipOf(p.secret, p.denunciaId, p.fiscalPk);
    return {
      ok: recomputado === p.autoriaHash,
      enLedger: this.ledger.autorias.includes(p.autoriaHash),
    };
  }

  async leerEstadoLedger(): Promise<EstadoLedger> {
    return {
      organizaciones: Object.keys(this.ledger.organizaciones).length,
      denuncias: [...this.ledger.denuncias],
      nullifiers: this.ledger.nullifiers.length,
      autorias: [...this.ledger.autorias],
    };
  }
}

function secretAleatorio(): Hex32 {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fabricado, y declarado como tal. No es un hash de transacción real. */
function txFabricado(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
