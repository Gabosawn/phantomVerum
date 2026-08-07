// Selftest de integración de B3 — la API REAL contra el contrato COMPILADO
// REAL, en el simulador local. Sin red, sin proof server, sin tDUST, sin mocks.
//
//   npm run build --workspace=app && node app/dist/api/selftest-simulador.js
//
// Requiere `npm run compile --workspace=contracts` previo (los artefactos ZK
// no hacen falta acá: el simulador ejecuta, no prueba).
//
// Qué cubre: los 4 tiempos de la demo pasando POR LA API (`ApiTestigo`), no
// por los circuitos a mano — esa es la diferencia con
// `witnesses/selftest-simulador.ts`, que valida la capa de abajo. Acá se
// verifica que registrar -> emitir -> denunciar -> revelar -> verificar
// funciona con las firmas congeladas de docs/03 §3.1, más los tres negativos
// del criterio de aceptación (credencial inválida, nullifier repetido, secret
// ajeno) y que ninguno de ellos mueve el ledger.
//
// Lo que este selftest NO cubre, y conviene decirlo: la capa de transacción
// —proving, balanceo y submit—. Eso vive en `ejecutor-red.ts` y lo valida B5
// contra Preview. La lógica de negocio, que es lo de acá, es la misma en los
// dos caminos por construcción (ver `ejecutor.ts`).

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { check, checkRechazaAsync, resumen } from '../witnesses/check.js';
import { epocaDeSegundos } from '../witnesses/epoca.js';
import { hashEvidenciaBytes } from '../witnesses/evidencia.js';
import { aBytes32, aHex, bytesAleatorios32 } from '../witnesses/hex.js';
import { pureCircuits, stagearDenunciaGuardada } from '../witnesses/index.js';
import {
  agregarDenuncia,
  crearSecrets,
  leerSecrets,
  obtenerDenuncia,
} from '../witnesses/secrets.js';

import {
  CredencialInvalidaError,
  NoSosElAutorError,
  NullifierRepetidoError,
  mapearErrorDeCircuito,
} from './errores.js';
import { ApiTestigo, conectarSimulador } from './testigo.js';
import type { EstadoLedger, ExportLlaveAutoria } from './tipos.js';

// Mismo instante fijo que los otros selftests: 2026-08-07T00:00:00Z, en
// SEGUNDOS. Fijarlo hace el test determinístico y hace que `periodoActual()`
// no dependa de cuándo se corra.
const AHORA = 1786147200;

// Almacén de secrets descartable: este test NO toca los secrets reales.
const dirTmp = mkdtempSync(path.join(tmpdir(), 'testigo-b3-'));
const rutaSecrets = path.join(dirTmp, 'denunciante.json');
const rutaSecretsImpostor = path.join(dirTmp, 'impostor.json');
process.on('exit', () => {
  rmSync(dirTmp, { recursive: true, force: true });
});

const orgId = bytesAleatorios32();
const ancla = bytesAleatorios32();
const fiscalPk = bytesAleatorios32();
const empleadorPk = bytesAleatorios32();

const { api, ejecutor } = conectarSimulador({ ahora: AHORA, rutaSecrets });
const EPOCA = epocaDeSegundos(AHORA);

/** Huella del ledger, para comparar antes/después de un negativo. */
const huella = (e: EstadoLedger): string =>
  JSON.stringify([e.organizaciones, e.denuncias.length, e.nullifiers, e.autorias.length]);

/** ¿`fn` lanza un error del tipo `Tipo`? */
const esDelTipo = async (
  fn: () => Promise<unknown>,
  Tipo: new (...a: never[]) => Error,
): Promise<boolean> => {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof Tipo;
  }
};

// ─────────────────────────────────────────────────────────────────────────

console.log('=== 0. La API arranca contra el simulador ===');
check('modo simulador', api.modo === 'simulador');
check('hay una contractAddress', api.contractAddress.length > 0);
check(
  'periodoActual() usa el reloj del ejecutor, no Date.now()',
  api.periodoActual() === EPOCA,
  `${api.periodoActual()} == ${EPOCA}`,
);

const vacio = await api.leerEstadoLedger();
check(
  'el ledger arranca vacío',
  vacio.organizaciones === 0 &&
    vacio.denuncias.length === 0 &&
    vacio.nullifiers === 0 &&
    vacio.autorias.length === 0,
);

console.log('\n=== 1. T1 — la organización se registra (B3.2) ===');
const txOrg = await api.registrarOrganizacion({ orgId, ancla });
check('devuelve un txId', txOrg.txId.length > 0, txOrg.txId);
check('marcado como simulado (no es un txId de explorer)', txOrg.simulado === true);
check('organizaciones == 1', (await api.leerEstadoLedger()).organizaciones === 1);

console.log('\n=== 2. T1 — credencial: el cliente genera, el emisor solo ve el commitment ===');
const credencial = await api.prepararCredencialLocal(orgId);
check('el commitment es de 64 chars hex', credencial.credCommitment.length === 64);
check(
  'el commitment NO es el secret (H-4: el emisor nunca ve el secret)',
  credencial.credCommitment !== credencial.credencialSecret,
);
check(
  'coincide con credCommitmentDe() del pure circuit',
  credencial.credCommitment ===
    aHex(pureCircuits.credCommitmentDe(aBytes32(credencial.credencialSecret))),
);

console.log('\n=== 3. NEGATIVO: denunciar antes de que el emisor inserte la hoja ===');
// Es uno de los tres casos que H-5 (regla 4) obliga a hacer indistinguibles:
// "tengo credencial pero todavía no la emitieron" tiene que salir por el mismo
// lugar y con el mismo texto que "no tengo credencial" y que "es de otra org".
const antesDeEmitir = huella(await api.leerEstadoLedger());
await checkRechazaAsync(
  'denunciar sin la hoja en el árbol -> CredencialInvalidaError',
  () =>
    api.denunciar({ orgId, periodo: EPOCA, evidencia: Buffer.from('intento prematuro') }),
  'credencial no emitida para esta org',
);
check(
  'el error es CredencialInvalidaError',
  await esDelTipo(
    () => api.denunciar({ orgId, periodo: EPOCA, evidencia: Buffer.from('otro intento') }),
    CredencialInvalidaError,
  ),
);
check(
  'y el ledger no se movió: no se emitió ninguna tx',
  huella(await api.leerEstadoLedger()) === antesDeEmitir,
);

console.log('\n=== 4. T1 — el emisor inserta la hoja (B3.3) ===');
const emision = await api.emitirCredencial({ orgId, credCommitment: credencial.credCommitment });
check('hojaIndex == 0 (primera hoja del árbol)', emision.hojaIndex === 0, String(emision.hojaIndex));
check('devuelve tx', emision.tx.txId.length > 0);
check(
  'el hojaIndex quedó persistido en el almacén local',
  leerSecrets(rutaSecrets)?.hojaIndex === 0,
);
check(
  'credencialesEmitidas == 1 en el ledger',
  (await api.leerEstadoLedger()).credencialesEmitidas === 1,
);

console.log('\n=== 5. T2 — la denuncia (B3.4) ===');
const evidencia1 = Buffer.from('sumario interno — planta 3');
const denuncia1 = await api.denunciar({ orgId, periodo: EPOCA, evidencia: evidencia1 });
check('devuelve denunciaId', denuncia1.denunciaId.length === 64);
check('devuelve nullifier', denuncia1.nullifier.length === 64);
check('devuelve secretDenuncia', denuncia1.secretDenuncia.length === 64);
check(
  'el evidenciaHash es el sha-256 local de la evidencia',
  denuncia1.evidenciaHash === aHex(hashEvidenciaBytes(evidencia1)),
);
check(
  'el denunciaId es denunciaIdDe(evidenciaHash, secretDenuncia)',
  denuncia1.denunciaId ===
    aHex(
      pureCircuits.denunciaIdDe(
        aBytes32(denuncia1.evidenciaHash),
        aBytes32(denuncia1.secretDenuncia),
      ),
    ),
);
check(
  'el nullifier es nullifierDe(credSecret, orgId, periodo)',
  denuncia1.nullifier ===
    aHex(pureCircuits.nullifierDe(aBytes32(credencial.credencialSecret), orgId, EPOCA)),
);

const trasDenuncia = await api.leerEstadoLedger();
check('la denuncia quedó sellada', trasDenuncia.denuncias.includes(denuncia1.denunciaId));
check('se quemó 1 nullifier', trasDenuncia.nullifiers === 1);

console.log('\n--- El secret se persistió ANTES de la tx (si se pierde, no hay autoría) ---');
const guardado = obtenerDenuncia(denuncia1.denunciaId, rutaSecrets);
check('el registro está en el almacén local', guardado !== null);
check(
  'con el mismo secretDenuncia que devolvió la API',
  guardado?.secretDenuncia === denuncia1.secretDenuncia,
);
check('y con la época en que se emitió', guardado?.periodo === String(EPOCA));

console.log('\n=== 6. NEGATIVO: nullifier repetido (el anti-spam) ===');
const antesDeRepetir = huella(await api.leerEstadoLedger());
await checkRechazaAsync(
  're-denunciar en la misma época -> NullifierRepetidoError',
  () =>
    api.denunciar({
      orgId,
      periodo: EPOCA,
      evidencia: Buffer.from('otra evidencia, misma época'),
    }),
  'ya denunciaste este periodo',
);
check(
  'el error es NullifierRepetidoError',
  await esDelTipo(
    () => api.denunciar({ orgId, periodo: EPOCA, evidencia: Buffer.from('y otra más') }),
    NullifierRepetidoError,
  ),
);
check(
  'y el ledger no se movió: no se emitió ninguna tx',
  huella(await api.leerEstadoLedger()) === antesDeRepetir,
);

console.log('\n=== 7. Segunda denuncia, época siguiente (H-3: secret fresco por denuncia) ===');
ejecutor.avanzarReloj(86400);
const EPOCA2 = api.periodoActual();
check('la época avanzó en 1', EPOCA2 === EPOCA + 1n, `${EPOCA} -> ${EPOCA2}`);

const denuncia2 = await api.denunciar({
  orgId,
  periodo: EPOCA2,
  evidencia: Buffer.from('planilla de pagos 2026'),
});
check(
  'la denuncia 2 usa un secretDenuncia DISTINTO al de la 1 (H-3)',
  denuncia2.secretDenuncia !== denuncia1.secretDenuncia,
);
check('y por lo tanto otro denunciaId', denuncia2.denunciaId !== denuncia1.denunciaId);
const trasDenuncia2 = await api.leerEstadoLedger();
check('denuncias == 2', trasDenuncia2.denuncias.length === 2);
check('nullifiers == 2', trasDenuncia2.nullifiers === 2);

console.log('\n=== 8. T4 — revelar autoría al fiscal (B3.5) ===');
const reveal = await api.revelarAutoria({ denunciaId: denuncia1.denunciaId, fiscalPk });
check('devuelve autoriaHash', reveal.autoriaHash.length === 64);
check(
  'es autoriaDe(secretDenuncia, denunciaId, fiscalPk)',
  reveal.autoriaHash ===
    aHex(
      pureCircuits.autoriaDe(
        aBytes32(denuncia1.secretDenuncia),
        aBytes32(denuncia1.denunciaId),
        fiscalPk,
      ),
    ),
);
check('la autoría quedó publicada', (await api.leerEstadoLedger()).autorias.includes(reveal.autoriaHash));

console.log('\n=== 9. NEGATIVO: secret ajeno — por los DOS caminos ===');

// 9a. Camino barato: el almacén local no reconstruye ese denunciaId. Cuesta un
// hash y evita ~30 s de proving.
crearSecrets(orgId, rutaSecretsImpostor);
agregarDenuncia(
  denuncia1.denunciaId, // dice ser la denuncia de la víctima...
  { secretDenuncia: bytesAleatorios32(), evidenciaHash: bytesAleatorios32() }, // ...con secrets inventados
  rutaSecretsImpostor,
);
const apiImpostor = new ApiTestigo(ejecutor, { rutaSecrets: rutaSecretsImpostor });
const antesDeImpostor = huella(await api.leerEstadoLedger());
await checkRechazaAsync(
  'secret ajeno -> rechazado por el chequeo local, sin proving',
  () => apiImpostor.revelarAutoria({ denunciaId: denuncia1.denunciaId, fiscalPk }),
  'los secrets guardados no reconstruyen esa denuncia',
);
check(
  'el error es NoSosElAutorError',
  await esDelTipo(
    () => apiImpostor.revelarAutoria({ denunciaId: denuncia1.denunciaId, fiscalPk }),
    NoSosElAutorError,
  ),
);

// 9b. El que realmente vale: el `assert` del circuito. Se saltea el chequeo
// local a propósito (stagear SIN pasar el denunciaId esperado) para llegar
// hasta el contrato. Si esto pasara, la seguridad dependería de un `if` de la
// app en vez de del circuito.
const psVictima = await ejecutor.leerEstadoPrivado();
await ejecutor.escribirEstadoPrivado(
  stagearDenunciaGuardada(psVictima, {
    secretDenuncia: bytesAleatorios32(),
    evidenciaHash: bytesAleatorios32(),
  }),
);
await checkRechazaAsync(
  'secret ajeno -> el assert del CIRCUITO también rechaza',
  async () => {
    try {
      await ejecutor.llamar('revelarAutoria', aBytes32(denuncia1.denunciaId), fiscalPk);
    } catch (e) {
      throw mapearErrorDeCircuito(e, 'revelarAutoria');
    }
  },
  'no sos el autor',
);
await ejecutor.escribirEstadoPrivado(psVictima);
check(
  'y el ledger no se movió en ninguno de los dos casos',
  huella(await api.leerEstadoLedger()) === antesDeImpostor,
);

console.log('\n=== 10. B3.8 + B3.6 — export de llave y verificación off-chain ===');
const llaveFiscal = api.exportarLlave(denuncia1.denunciaId, fiscalPk);
check('el export es v2', llaveFiscal.version === 2);
check(
  'trae los 5 campos del formato §3.2',
  llaveFiscal.denunciaId.length === 64 &&
    llaveFiscal.evidenciaHash.length === 64 &&
    llaveFiscal.secretDenuncia.length === 64 &&
    llaveFiscal.fiscalPk.length === 64 &&
    llaveFiscal.autoriaHash.length === 64,
);
check('su autoriaHash es el que se publicó on-chain', llaveFiscal.autoriaHash === reveal.autoriaHash);

console.log('\n--- Los 4 casos de la tabla del README ---');

// (1) Autor real, fiscal correcto.
const v1 = await api.verificarAutoria(llaveFiscal);
check('AUTOR REAL       -> ok && enLedger', v1.ok && v1.enLedger, v1.detalle);

// (2) Secret ajeno: la aritmética no cierra.
const v2 = await api.verificarAutoria({
  ...llaveFiscal,
  secretDenuncia: aHex(bytesAleatorios32()),
});
check('SECRET AJENO     -> !ok', !v2.ok, v2.detalle);
check('                    y tampoco está en el ledger', !v2.enLedger);
check('                    el chequeo que falla es el denunciaId', !v2.checks.denunciaIdCoincide);

// (3) Denuncia que nunca se selló: el paquete es consistente consigo mismo
//     pero no hay nada on-chain.
const secretFantasma = bytesAleatorios32();
const evFantasma = bytesAleatorios32();
const idFantasma = pureCircuits.denunciaIdDe(evFantasma, secretFantasma);
const llaveFantasma: ExportLlaveAutoria = {
  version: 2,
  denunciaId: aHex(idFantasma),
  evidenciaHash: aHex(evFantasma),
  secretDenuncia: aHex(secretFantasma),
  fiscalPk: aHex(fiscalPk),
  autoriaHash: aHex(pureCircuits.autoriaDe(secretFantasma, idFantasma, fiscalPk)),
};
const v3 = await api.verificarAutoria(llaveFantasma);
check('DENUNCIA INEXIST -> ok pero !enLedger', v3.ok && !v3.enLedger, v3.detalle);
check('                    la denuncia no está sellada', !v3.checks.denunciaEnLedger);

// (4) EL MOMENTO DEL VIDEO: mismo autor, misma denuncia, OTRO destinatario.
const llaveEmpleador = api.exportarLlave(denuncia1.denunciaId, empleadorPk);
const v4 = await api.verificarAutoria(llaveEmpleador);
check(
  'OTRO FISCAL      -> el autoriaHash es OTRO',
  llaveEmpleador.autoriaHash !== llaveFiscal.autoriaHash,
);
check('                    la aritmética cierra igual (ok)', v4.ok);
check('                    pero NO está publicado para esa pk', !v4.enLedger, v4.detalle);

console.log('\n--- FISCAL ✅ / EMPLEADOR ❌ sobre la MISMA denuncia ---');
check('FISCAL    -> AUTORÍA VERIFICADA', v1.ok && v1.enLedger);
check('EMPLEADOR -> NO VERIFICA', !(v4.ok && v4.enLedger));

console.log('\n=== 11. B3.7 — estado final del ledger ===');
const final = await api.leerEstadoLedger();
check('organizaciones == 1', final.organizaciones === 1);
check('denuncias == 2', final.denuncias.length === 2);
check('nullifiers == 2', final.nullifiers === 2);
check('autorias == 1', final.autorias.length === 1);
check('credenciales emitidas == 1', final.credencialesEmitidas === 1);
check(
  'las dos denuncias son las que devolvió la API',
  final.denuncias.includes(denuncia1.denunciaId) && final.denuncias.includes(denuncia2.denunciaId),
);

resumen('selftest API B3 vs simulador');
