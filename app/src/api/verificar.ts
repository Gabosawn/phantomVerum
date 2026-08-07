/**
 * B3.6 + B3.8 — Verificación de autoría y export de llave. 100 % off-chain.
 *
 * Nada de este módulo necesita wallet, seed, proof server ni tDUST. La
 * verificación son cuatro hashes con los `pure circuit` exportados por el
 * contrato, más una lectura al indexer. Eso es lo que permite que un fiscal
 * verifique una autoría con una URL y un archivo JSON, y es —literalmente— el
 * momento del video: la misma prueba, la clave del fiscal ✅, la del empleador
 * ❌.
 *
 * Que salga gratis es consecuencia de haber exportado `denunciaIdDe`,
 * `autoriaDe`, etc. como `export pure circuit` (docs/03 §2.4).
 */
import {
  type Hex32,
  aHex,
  comoBytes32,
  comoHex32,
  esHex32,
} from '../witnesses/hex.js';
import { pureCircuits } from '../witnesses/index.js';
import { obtenerDenuncia } from '../witnesses/secrets.js';

import type { LectorLedger } from './ejecutor.js';
import { ErrorTestigo } from './errores.js';
import { crearLectorSoloLectura } from './ledger.js';
import type { Bytes32Entrada, ExportLlaveAutoria, ResultadoVerificacion } from './tipos.js';

/** El almacén local no tiene los secrets de esa denuncia. */
export class SinSecretsDeLaDenunciaError extends ErrorTestigo {
  constructor(denunciaId: Hex32) {
    super(
      `no hay secrets locales para la denuncia ${denunciaId}. ` +
        'Sin el secretDenuncia no hay forma de reclamar ni exportar su autoría: ' +
        'se genera una sola vez, al denunciar, y no se puede recuperar.',
    );
  }
}

/** El JSON que se cargó no tiene la forma de un export v2. */
export class ExportInvalidoError extends ErrorTestigo {
  constructor(detalle: string) {
    super(`export de llave de autoría inválido: ${detalle}`);
  }
}

/**
 * B3.8 — Arma el paquete que el denunciante le entrega al fiscal.
 *
 * Lee el `secretDenuncia` del almacén local (`secrets/denunciante.json`) y
 * recomputa `autoriaHash` para ESE fiscal. Es 100 % local: no toca la red.
 *
 * ⚠️ El resultado es material sensible — ver la nota de `ExportLlaveAutoria`.
 * Un export por fiscal: el `autoriaHash` depende de `fiscalPk`, así que el
 * paquete para el fiscal A no verifica contra el registro del fiscal B.
 */
export const exportarLlave = (
  denunciaId: Bytes32Entrada,
  fiscalPk: Bytes32Entrada,
  rutaSecrets?: string,
): ExportLlaveAutoria => {
  const idHex = comoHex32(denunciaId, 'denunciaId');
  const idBytes = comoBytes32(idHex, 'denunciaId');
  const pkBytes = comoBytes32(fiscalPk, 'fiscalPk');

  const registro = obtenerDenuncia(idHex, rutaSecrets);
  if (registro === null) {
    throw new SinSecretsDeLaDenunciaError(idHex);
  }
  const secretBytes = comoBytes32(registro.secretDenuncia, 'secretDenuncia');

  return {
    version: 2,
    denunciaId: idHex,
    evidenciaHash: registro.evidenciaHash,
    secretDenuncia: registro.secretDenuncia,
    fiscalPk: aHex(pkBytes),
    autoriaHash: aHex(pureCircuits.autoriaDe(secretBytes, idBytes, pkBytes)),
  };
};

/**
 * Valida un export que vino de afuera (un archivo que le pasaron al fiscal).
 *
 * Es entrada NO confiable: se valida campo por campo antes de tocarla. Sin
 * esto, un hex corto explotaría adentro de un pure circuit con un error
 * ilegible en vez de un mensaje que diga qué archivo está mal.
 */
export const parsearExportLlave = (crudo: unknown): ExportLlaveAutoria => {
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    throw new ExportInvalidoError('se esperaba un objeto JSON');
  }
  const o = crudo as Record<string, unknown>;
  if (o['version'] !== 2) {
    throw new ExportInvalidoError(
      `version ${String(o['version'])}, se esperaba 2. El formato v1 traía un ` +
        'secret global (inseguro por H-3, docs/03 §3.4) y no se migra.',
    );
  }
  const campos = ['denunciaId', 'evidenciaHash', 'secretDenuncia', 'fiscalPk', 'autoriaHash'] as const;
  for (const campo of campos) {
    if (!esHex32(o[campo])) {
      throw new ExportInvalidoError(`"${campo}" no es un hex de 64 chars minúscula`);
    }
  }
  return {
    version: 2,
    denunciaId: o['denunciaId'] as Hex32,
    evidenciaHash: o['evidenciaHash'] as Hex32,
    secretDenuncia: o['secretDenuncia'] as Hex32,
    fiscalPk: o['fiscalPk'] as Hex32,
    autoriaHash: o['autoriaHash'] as Hex32,
  };
};

/**
 * B3.6 — `verificarAutoria`.
 *
 * Dos preguntas independientes (ver `ResultadoVerificacion`):
 *
 *  1. `ok`       — ¿la aritmética cierra? Se recomputa `denunciaIdDe` y
 *                  `autoriaDe` con los pure circuits. Es la misma condición
 *                  C1 que chequea el circuito `revelarAutoria`, corrida
 *                  off-chain.
 *  2. `enLedger` — ¿ese `autoriaHash` está publicado on-chain?
 *
 * Las búsquedas en el ledger se hacen con los valores RECOMPUTADOS, no con los
 * declarados en el archivo. Si alguien copia un `denunciaId` y un `autoriaHash`
 * reales de la cadena pero inventa el `secretDenuncia`, lo recomputado no
 * coincide con nada y le da `ok: false, enLedger: false`. Confiar en los
 * campos declarados para la búsqueda convertiría el "verificador" en un
 * repetidor de lo que diga el archivo.
 *
 * Sin `lector`, consulta el indexer de la red activa contra la address de
 * `deployment.json`. El simulador pasa el suyo y ejercita el mismo código.
 */
export const verificarAutoria = async (
  exportado: ExportLlaveAutoria,
  lector?: LectorLedger,
): Promise<ResultadoVerificacion> => {
  const paquete = parsearExportLlave(exportado);

  const evBytes = comoBytes32(paquete.evidenciaHash, 'evidenciaHash');
  const secBytes = comoBytes32(paquete.secretDenuncia, 'secretDenuncia');
  const idDeclarado = comoBytes32(paquete.denunciaId, 'denunciaId');
  const pkBytes = comoBytes32(paquete.fiscalPk, 'fiscalPk');

  // C1 off-chain: ¿este secret + esta evidencia producen esa denuncia?
  const idRecomputado = pureCircuits.denunciaIdDe(evBytes, secBytes);
  const denunciaIdCoincide = aHex(idRecomputado) === paquete.denunciaId;

  // La autoría se ata a la pk de ESTE fiscal. Con otra pk sale otro hash.
  const autoriaRecomputada = pureCircuits.autoriaDe(secBytes, idDeclarado, pkBytes);
  const autoriaHashCoincide = aHex(autoriaRecomputada) === paquete.autoriaHash;

  const ok = denunciaIdCoincide && autoriaHashCoincide;

  const fuente = lector ?? (await crearLectorSoloLectura());
  const ledger = await fuente.leerLedger();
  const denunciaEnLedger = ledger.denuncias.member(idRecomputado);
  const autoriaEnLedger = ledger.autorias.member(autoriaRecomputada);
  const enLedger = denunciaEnLedger && autoriaEnLedger;

  return {
    ok,
    enLedger,
    detalle: describir({ ok, denunciaIdCoincide, autoriaHashCoincide, denunciaEnLedger, autoriaEnLedger }),
    checks: { denunciaIdCoincide, autoriaHashCoincide, denunciaEnLedger, autoriaEnLedger },
  };
};

/** Mensaje legible. Es lo que imprime `verificar-autoria.ts` (B4.5). */
const describir = (r: {
  ok: boolean;
  denunciaIdCoincide: boolean;
  autoriaHashCoincide: boolean;
  denunciaEnLedger: boolean;
  autoriaEnLedger: boolean;
}): string => {
  if (!r.denunciaIdCoincide) {
    return 'el secretDenuncia del paquete NO reconstruye ese denunciaId: quien lo armó no es el autor';
  }
  if (!r.autoriaHashCoincide) {
    return 'el autoriaHash declarado no coincide con el que sale de (secret, denunciaId, fiscalPk): paquete alterado';
  }
  if (!r.denunciaEnLedger) {
    return 'la aritmética cierra, pero esa denuncia no está sellada en el ledger';
  }
  if (!r.autoriaEnLedger) {
    return (
      'la aritmética cierra y la denuncia existe, pero la autoría NO está publicada ' +
      'para esta fiscalPk (la autoría on-chain está ligada a la clave de otro destinatario)'
    );
  }
  return 'autoría verificada: el paquete es consistente y el hash está publicado on-chain para esta fiscalPk';
};
