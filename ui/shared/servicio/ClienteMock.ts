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
  credCommitmentOf,
  EPOCH_DURATION_SECONDS,
  hashDeArchivo,
  leafOf,
  nullifierOf,
  reportIdOf,
  type Hex32,
} from "../cripto";
import {
  AuthorshipAlreadyRevealedError,
  CredencialInvalidaError,
  DenunciaRepetidaError,
  NoSosElAutorError,
  NullifierRepetidoError,
  OrganizacionYaRegistradaError,
  OrganizationNotRegisteredError,
  PeriodNotStartedError,
  PeriodOverError,
  ReportDoesNotExistError,
  type EstadoLedger,
  type ExportLlaveAutoria,
  type ResultadoVerificacion,
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
  "C0 · blockTime dentro de [inicio, fin) de la época · el período no lo elige el denunciante",
  "merkleTreePathRoot(leafOf(orgId, credCommitmentOf(cred))) · checkRoot contra el ancla · depth 8",
  "nullifier = H(dom:nullifier ‖ credSecret ‖ orgId ‖ época)",
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
  /**
   * The chain clock, in Unix SECONDS — the mock's stand-in for `blockTime`.
   * Injectable so tests can advance it across epochs. Defaults to the real
   * clock, which is what the demo uses.
   */
  now?: () => number;
};

export class ClienteMock implements TestigoClient {
  private ledger: LedgerLocal;
  private witnesses: Witnesses | null = null;
  private readonly ritmoMs: number;
  private readonly alCambiar?: (ledger: LedgerLocal) => void;
  private readonly now: () => number;

  constructor(opciones: OpcionesMock = {}) {
    this.ledger = opciones.ledgerInicial ?? ledgerVacio();
    this.ritmoMs = opciones.ritmoMs ?? 600;
    this.alCambiar = opciones.alCambiar;
    this.now = opciones.now ?? (() => Math.floor(Date.now() / 1000));
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

  /**
   * Mirror of `issueCredential(orgId, credCommitment)`: the issuer receives
   * the COMMITMENT — never `credSecret` — and builds the leaf ITSELF from the
   * orgId it just validated. If the leaf arrived precomputed, the org check
   * would be decorative: one could smuggle in a leaf bound to an organization
   * that never registered (the phantom-org attack the contract closes).
   */
  async emitirCredencial(p: {
    orgId: Hex32;
    credCommitment: Hex32;
  }): Promise<{ hojaIndex: number; tx: TxResult }> {
    // assert(organizations.member(orgId), "organization not registered")
    if (!(p.orgId in this.ledger.organizaciones)) {
      throw new OrganizationNotRegisteredError();
    }
    const hoja = leafOf(p.orgId, p.credCommitment);
    const hojaIndex = this.ledger.credenciales.indexOf(hoja);
    if (hojaIndex === -1) this.ledger.credenciales.push(hoja);
    return {
      hojaIndex: hojaIndex === -1 ? this.ledger.credenciales.length - 1 : hojaIndex,
      tx: this.confirmar(2),
    };
  }

  async denunciar(
    p: { orgId: Hex32; periodo: number; evidencia: Uint8Array },
    onPaso?: Progreso,
  ): Promise<{ denunciaId: Hex32; nullifier: Hex32; tx: TxResult }> {
    const w = this.exigirWitnesses();

    // El archivo se hashea acá y sólo el hash sigue viaje. Esto es real.
    const evidenciaHash = await hashDeArchivo(p.evidencia);

    // C0 — the period is NOT freely chosen by the caller: it must be the
    // CURRENT epoch (`start <= blockTime < start + duration`). Without this,
    // the same credential would yield N distinct nullifiers by varying the
    // period and the anti-spam would be worth nothing.
    const windowStart = p.periodo * EPOCH_DURATION_SECONDS;
    const blockTime = this.now();
    if (blockTime < windowStart) {
      throw new PeriodNotStartedError();
    }
    if (blockTime >= windowStart + EPOCH_DURATION_SECONDS) {
      throw new PeriodOverError();
    }

    // C1 — pertenencia. En el circuito es merkleTreePathRoot + checkRoot; acá
    // es pertenencia de la hoja al set de credenciales emitidas. La semántica
    // que se demuestra es la misma: probás que sos de adentro sin decir quién.
    // The leaf is rebuilt from the COMMITMENT, exactly like the circuit does.
    const hoja = leafOf(p.orgId, credCommitmentOf(w.credencialSecret));
    if (!this.ledger.credenciales.includes(hoja)) {
      throw new CredencialInvalidaError();
    }

    // C2 — el nullifier usa el secret de la CREDENCIAL, no el personal.
    const nullifier = nullifierOf(w.credencialSecret, p.orgId, BigInt(p.periodo));
    if (this.ledger.nullifiers.includes(nullifier)) {
      throw new NullifierRepetidoError();
    }

    const denunciaId = reportIdOf(evidenciaHash, w.secretPersonal);
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

    // C1 — assert(reportIdOf(ev, secret) == reportId, "not the author").
    const recomputado = reportIdOf(w.evidenciaHash, w.secretPersonal);
    if (recomputado !== p.denunciaId) {
      throw new NoSosElAutorError();
    }

    // C2 — assert(reports.member(reportId), "report does not exist").
    if (!this.ledger.denuncias.includes(p.denunciaId)) {
      throw new ReportDoesNotExistError();
    }

    const autoriaHash = authorshipOf(w.secretPersonal, p.denunciaId, p.fiscalPk);
    // assert(!authorships.member(...), "authorship already revealed to this prosecutor")
    if (this.ledger.autorias.includes(autoriaHash)) {
      throw new AuthorshipAlreadyRevealedError();
    }

    await this.correrPasos(PASOS_REVELAR, onPaso);

    this.ledger.autorias.push(autoriaHash);

    return { autoriaHash, tx: this.confirmar(4) };
  }

  /**
   * 100 % off-chain: lee el ledger y compara contra la clave de quien pregunta.
   *
   * `verificadorPk` es la clave DE QUIEN VERIFICA, y es un parámetro aparte a
   * propósito: el material trae la clave a la que el denunciante designó la
   * prueba, y la pregunta que hay que contestar es si esas dos coinciden. Si se
   * dejara que quien verifica escriba `p.fiscalPk`, cualquiera que intercepte
   * el material se auto-designaría y la prueba diría que sí.
   *
   * FAIL-CLOSED, y por eso nunca devuelve `verificado`. Este build no verifica
   * la proof ZK de `proveAuthorship`: `proof` es una copia de `autoriaHash`, y
   * los dos campos los aporta quien trae el sobre. Refutar sí puede — que el
   * sobre esté dirigido a otra clave, o que lo que declara no esté en la
   * cadena, se decide con datos públicos. Ver `VeredictoAutoria`.
   */
  async verificarAutoria(
    p: ExportLlaveAutoria,
    verificadorPk: Hex32,
  ): Promise<ResultadoVerificacion> {
    if (p.version !== 2) {
      return { veredicto: "refutado", enLedger: false };
    }
    const enLedger = this.ledger.autorias.includes(p.autoriaHash);
    // Asimétrico a propósito: la igualdad no prueba nada (la escriben ambos
    // lados quien trae el sobre), pero la desigualdad sí desmiente — el sobre
    // no salió del formato que este build emite.
    const proofMalformada = p.proof !== p.autoriaHash;
    const designadaAEstaClave = p.fiscalPk === verificadorPk;

    if (proofMalformada || !designadaAEstaClave || !enLedger) {
      return { veredicto: "refutado", enLedger };
    }
    return { veredicto: "no-verificable", enLedger };
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

/** Fabricado, y declarado como tal. No es un hash de transacción real. */
function txFabricado(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
