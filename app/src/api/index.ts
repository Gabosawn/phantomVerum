/**
 * B3 — Punto de entrada de la API de Testigo.
 *
 * Es lo que consumen los scripts CLI de B4, `ui/` (bloque C) y `tests/`
 * (bloque D). Las firmas están congeladas en `docs/03-plan-ejecucion.md` §3.1.
 *
 * Los dos caminos:
 *
 *     // contra la red activa (NETWORK=preview|local)
 *     const api = await conectarContrato();
 *
 *     // contra el simulador local: sin red, sin proof server, sin tDUST
 *     const { api } = conectarSimulador();
 *
 * De ahí para abajo el código es idéntico.
 */

// ── API principal ───────────────────────────────────────────────────────
export {
  ApiTestigo,
  type ConfigApi,
  type CredencialLocal,
  type ResultadoDeploy,
  conectarContrato,
  conectarSimulador,
  deployContrato,
} from './testigo.js';

// ── Off-chain: verificación y export (no necesitan wallet ni proof server) ──
export {
  ExportInvalidoError,
  SinSecretsDeLaDenunciaError,
  exportarLlave,
  parsearExportLlave,
  verificarAutoria,
} from './verificar.js';

// ── Lectura del ledger ──────────────────────────────────────────────────
export {
  ContratoNoEncontradoError,
  LectorIndexer,
  crearLectorSoloLectura,
  ledgerDesdeEstado,
  leerEstadoLedger,
  resumirLedger,
  type OpcionesLectorSoloLectura,
} from './ledger.js';

// ── Ejecutores ──────────────────────────────────────────────────────────
export {
  type AlmacenEstadoPrivado,
  type ArgsDeCircuito,
  type CircuitoTestigo,
  type EjecutorTestigo,
  type LectorLedger,
} from './ejecutor.js';
export {
  EjecutorSimulador,
  type OpcionesSimulador,
  crearEjecutorSimulador,
} from './ejecutor-simulador.js';
export {
  EjecutorRed,
  TAG_CONTRATO,
  type ContratoCompilado,
  type ContratoTestigo,
  type OpcionesRed,
  compilarContrato,
} from './ejecutor-red.js';

// ── Errores tipados ─────────────────────────────────────────────────────
export {
  AutoriaYaReveladaError,
  CredencialInvalidaError,
  DenunciaInexistenteError,
  DenunciaYaSelladaError,
  ErrorDeCircuito,
  ErrorTestigo,
  NoSosElAutorError,
  NullifierRepetidoError,
  OrganizacionNoRegistradaError,
  OrganizacionYaRegistradaError,
  PeriodoInvalidoError,
  TxRechazadaError,
  fallóEnProofTime,
  mapearErrorDeCircuito,
  mensajesEncadenados,
} from './errores.js';

// ── Tipos congelados (§3.1 / §3.2) ──────────────────────────────────────
export type {
  Bytes32Entrada,
  EstadoLedger,
  ExportLlaveAutoria,
  Hex32,
  ParamsDenunciar,
  ParamsEmitirCredencial,
  ParamsRegistrarOrganizacion,
  ParamsRevelarAutoria,
  ResultadoDenunciar,
  ResultadoEmitirCredencial,
  ResultadoRevelarAutoria,
  ResultadoVerificacion,
  TxResult,
} from './tipos.js';

// ── Re-exports de B2 que B4 necesita ────────────────────────────────────
// Se re-exportan acá para que los scripts CLI tengan un solo import.
export { DURACION_EPOCA_SEG, epocaActual, epocaDeSegundos } from '../witnesses/epoca.js';
export { hashEvidenciaArchivo, hashEvidenciaBytes, resumenEvidencia } from '../witnesses/evidencia.js';
export { aBytes32, aHex, bytesAleatorios32, comoBytes32, comoHex32, esHex32 } from '../witnesses/hex.js';
export { pureCircuits } from '../witnesses/index.js';
