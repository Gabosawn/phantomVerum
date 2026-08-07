// Selftest de B2.3 — los witnesses REALES contra el contrato COMPILADO
// REAL, en el simulador local de @midnight-ntwrk/compact-runtime. Sin red,
// sin proof server, sin mocks.
//
//   npm run build --workspace=app && node app/dist/witnesses/selftest-simulador.js
//
// Requiere `npm run compile --workspace=contracts` (o `compile:fast`) previo.
//
// Nota sobre `contracts/test/harness.mjs`: hace exactamente esta construcción
// de contexto y se leyó para escribir esto, pero NO se importa. Dos razones:
// es JavaScript sin tipos y este workspace compila en `strict` (importarlo
// haría implícito `any` todo el mundo del simulador, que es justo lo que este
// selftest tiene que verificar), y lo está editando otro agente en paralelo.
// Lo que sí se comparte es el instante fijo, para que los dos scripts hablen
// de la misma época.

import type { ChargedState } from '@midnight-ntwrk/compact-runtime';

import { Contract, ledger as leerLedger } from '../../../contracts/output/contract/index.js';

import { check, checkRechaza, mensajeDeError, resumen } from './check.js';
import {
  rutaRuntimeDeLaApp,
  rutaRuntimeDelContrato,
  runtime,
  runtimeUnificado,
} from './runtime-contrato.js';
import { epocaDeSegundos } from './epoca.js';
import { hashEvidenciaBytes } from './evidencia.js';
import { aHex, bytesAleatorios32 } from './hex.js';
import {
  type EstadoPrivadoTestigo,
  type Ledger,
  CredencialNoEmitidaError,
  commitmentDeCredencial,
  conCredencial,
  crearWitnesses,
  denunciaIdDeRegistro,
  estadoPrivadoAJson,
  estadoPrivadoDesdeJson,
  estadoPrivadoVacio,
  hojaDeCredencial,
  limpiarDenunciaActiva,
  pureCircuits,
  stagearDenunciaGuardada,
  stagearDenunciaNueva,
  witnesses,
} from './index.js';

const { createCircuitContext, createConstructorContext, sampleContractAddress } = runtime;

if (!runtimeUnificado) {
  console.warn(
    '⚠️  compact-runtime está DUPLICADO — este selftest usa la copia del ' +
      'contrato para poder correr, pero B3 (midnight-js) se va a chocar con\n' +
      "    CompactError: 'contractState' parameter ... has unexpected type\n" +
      `    contrato: ${rutaRuntimeDelContrato}\n` +
      `    app:      ${rutaRuntimeDeLaApp}\n` +
      '    Arreglo: borrar contracts/node_modules y reinstalar desde la raíz.\n',
  );
}

// Mismo instante fijo que contracts/test/harness.mjs: 2026-08-07T00:00:00Z.
const AHORA = 1786147200;
const EPOCA = epocaDeSegundos(AHORA);

const orgId = bytesAleatorios32();
const orgAjena = bytesAleatorios32();
const ancla = bytesAleatorios32();
const fiscalPk = bytesAleatorios32();
const empleadorPk = bytesAleatorios32();

// ── Mundo del simulador ─────────────────────────────────────────────────

const contrato = new Contract<EstadoPrivadoTestigo>(witnesses);
const address = sampleContractAddress();
const inicial = contrato.initialState(
  createConstructorContext<EstadoPrivadoTestigo>(estadoPrivadoVacio(), '0'.repeat(64)),
);

let estadoContrato: ChargedState = inicial.currentContractState.data;
let zswap = inicial.currentZswapLocalState;
let ps: EstadoPrivadoTestigo = estadoPrivadoVacio();
let reloj = AHORA;

const ctx = () =>
  createCircuitContext<EstadoPrivadoTestigo>(
    address,
    zswap,
    estadoContrato,
    ps,
    undefined,
    undefined,
    reloj,
  );

const estado = (): Ledger => leerLedger(estadoContrato);

type Impuros = Contract<EstadoPrivadoTestigo>['impureCircuits'];

/** Corre un circuito y absorbe el estado resultante. */
function call<N extends keyof Impuros>(nombre: N, ...args: unknown[]): void {
  const fn = contrato.impureCircuits[nombre] as (
    ...a: unknown[]
  ) => { context: ReturnType<typeof ctx> };
  const r = fn(ctx(), ...args);
  estadoContrato = r.context.currentQueryContext.state;
  zswap = r.context.currentZswapLocalState;
  ps = r.context.currentPrivateState;
}

/** Igual, pero con OTRO estado privado (impostores). No absorbe nada. */
function callComo(otroPs: EstadoPrivadoTestigo, nombre: keyof Impuros, ...args: unknown[]): void {
  const otro = new Contract<EstadoPrivadoTestigo>(crearWitnesses());
  const fn = otro.impureCircuits[nombre] as (...a: unknown[]) => unknown;
  fn(
    createCircuitContext<EstadoPrivadoTestigo>(
      address,
      zswap,
      estadoContrato,
      otroPs,
      undefined,
      undefined,
      reloj,
    ),
    ...args,
  );
}

/** WitnessContext armado a mano, para llamar un witness aislado. */
const ctxWitness = (estadoPrivado: EstadoPrivadoTestigo) => ({
  ledger: estado(),
  privateState: estadoPrivado,
  contractAddress: address,
});

// ─────────────────────────────────────────────────────────────────────────

console.log('=== 1. El estado privado arranca vacío y falla cerrado ===');
check('sin credencial no se puede calcular la hoja', mensajeDeError(() => hojaDeCredencial(ps)) !== null);
checkRechaza(
  'sin credencial, commitmentDeCredencial rechaza',
  () => commitmentDeCredencial(ps),
  'credencial no emitida para esta org',
);

console.log('\n=== 2. La org se registra; el cliente genera su credencial ===');
call('registrarOrganizacion', orgId, ancla);
check('organizaciones.size == 1', estado().organizaciones.size() === 1n);

// H-4: el secret lo genera el cliente. Al emisor se le manda el COMMITMENT.
const credencialSecret = bytesAleatorios32();
ps = conCredencial(ps, credencialSecret, orgId);
const commitment = commitmentDeCredencial(ps);
check(
  'el commitment es credCommitmentDe(credSecret) del pure circuit',
  aHex(commitment) === aHex(pureCircuits.credCommitmentDe(credencialSecret)),
);
check(
  'el commitment NO revela el secret (son valores distintos)',
  aHex(commitment) !== aHex(credencialSecret),
);

console.log('\n=== 3. Antes de emitir, el witness del path falla CERRADO ===');
const evidencia1 = hashEvidenciaBytes(Buffer.from('sumario interno — planta 3'));
const stage1 = stagearDenunciaNueva(ps, evidencia1);
ps = stage1.estado;
checkRechaza(
  'denunciar sin credencial en el arbol',
  () => call('denunciar', orgId, EPOCA),
  'credencial no emitida para esta org',
);
check('no se sello ninguna denuncia', estado().denuncias.isEmpty());
check('no se quemo ningun nullifier', estado().nullifiers.isEmpty());

console.log('\n--- El mensaje de fallo es UNICO (H-5 regla 4) ---');
// Tres situaciones distintas tienen que ser indistinguibles: sin credencial,
// con credencial de otra org, y con credencial correcta sin emitir.
const msgSinCredencial = mensajeDeError(() =>
  witnesses.credencialPath(ctxWitness(stagearDenunciaNueva(estadoPrivadoVacio(), evidencia1).estado)),
);
const msgOtraOrg = mensajeDeError(() =>
  witnesses.credencialPath(ctxWitness(conCredencial(ps, bytesAleatorios32(), orgAjena))),
);
const msgSinEmitir = mensajeDeError(() => witnesses.credencialPath(ctxWitness(ps)));
check('sin credencial -> lanza', msgSinCredencial !== null, String(msgSinCredencial));
check(
  'los 3 casos dan EXACTAMENTE el mismo mensaje',
  msgSinCredencial === msgOtraOrg && msgOtraOrg === msgSinEmitir,
  `"${String(msgSinEmitir)}"`,
);
check(
  'y el mismo tipo de error',
  (() => {
    try {
      witnesses.credencialPath(ctxWitness(estadoPrivadoVacio()));
      return false;
    } catch (e) {
      return e instanceof CredencialNoEmitidaError;
    }
  })(),
);

console.log('\n=== 4. El emisor agrega la hoja; el witness la encuentra ===');
call('emitirCredencial', orgId, commitment);
check('credenciales.firstFree == 1', estado().credenciales.firstFree() === 1n);
const hoja = hojaDeCredencial(ps);
check(
  'hojaDeCredencial coincide con hojaDe(orgId, credCommitmentDe(secret))',
  aHex(hoja) === aHex(pureCircuits.hojaDe(orgId, pureCircuits.credCommitmentDe(credencialSecret))),
);
check('findPathForLeaf ahora la encuentra', estado().credenciales.findPathForLeaf(hoja) !== undefined);

const [, camino1] = witnesses.credencialPath(ctxWitness(ps));
check('el witness devuelve 8 hermanos', camino1.length === 8, `len=${camino1.length}`);
check(
  'y son entradas {sibling:{field}, goes_left} (goes_left es snake_case)',
  typeof camino1[0]?.sibling.field === 'bigint' && typeof camino1[0]?.goes_left === 'boolean',
);

console.log('\n=== 5. Denuncia real (los 4 witnesses en un solo circuito) ===');
call('denunciar', orgId, EPOCA);
const denunciaId1 = stage1.denuncia.denunciaId;
const nullifier1 = pureCircuits.nullifierDe(credencialSecret, orgId, EPOCA);
check(
  'el denunciaId precomputado coincide con el sellado on-chain',
  estado().denuncias.member(denunciaId1),
  aHex(denunciaId1),
);
check('el nullifier de la epoca quedo quemado', estado().nullifiers.member(nullifier1));
console.log(`  periodo (epoca) = ${EPOCA}`);

checkRechaza(
  're-denuncia en la misma epoca',
  () => call('denunciar', orgId, EPOCA),
  'ya denunciaste este periodo',
);

console.log('\n=== 6. El path NUNCA se cachea (H-5) ===');
// Se emiten credenciales de otros empleados: el arbol se mueve. El witness
// tiene que devolver el path del estado NUEVO, no el que vio recien.
const raizAntes = estado().credenciales.root().field;
for (let i = 0; i < 3; i++) call('emitirCredencial', orgId, bytesAleatorios32());
const raizDespues = estado().credenciales.root().field;
check('3 inserciones movieron la raiz', raizAntes !== raizDespues);

const [, camino2] = witnesses.credencialPath(ctxWitness(ps));
const serie = (c: typeof camino1) => c.map((e) => `${e.sibling.field}:${String(e.goes_left)}`).join('|');
check(
  'el witness devuelve un path DISTINTO tras moverse el arbol (no hay cache)',
  serie(camino1) !== serie(camino2),
);
check('y sigue teniendo 8 hermanos', camino2.length === 8);
check(
  'la hoja no cambio: lo que cambia son los hermanos',
  aHex(hojaDeCredencial(ps)) === aHex(hoja),
);

console.log('\n=== 7. Segunda denuncia: secret FRESCO, no el de la primera (H-3) ===');
reloj = AHORA + 86400; // epoca siguiente, si no el nullifier bloquea
const EPOCA2 = epocaDeSegundos(reloj);
check('la epoca avanzo en 1', EPOCA2 === EPOCA + 1n, `${EPOCA} -> ${EPOCA2}`);

const evidencia2 = hashEvidenciaBytes(Buffer.from('planilla de pagos 2026'));
const stage2 = stagearDenunciaNueva(ps, evidencia2);
ps = stage2.estado;
check(
  'la denuncia 2 usa un secretDenuncia distinto al de la 1',
  aHex(stage2.denuncia.secretDenuncia) !== aHex(stage1.denuncia.secretDenuncia),
);
call('denunciar', orgId, EPOCA2);
const denunciaId2 = stage2.denuncia.denunciaId;
check('la denuncia 2 quedo sellada', estado().denuncias.member(denunciaId2));
check('denuncias.size == 2', estado().denuncias.size() === 2n);
check(
  'el nullifier de la epoca nueva tambien se quemo',
  estado().nullifiers.member(pureCircuits.nullifierDe(credencialSecret, orgId, EPOCA2)),
);
check(
  'los dos denunciaId son distintos y no linkeables por el secret',
  aHex(denunciaId1) !== aHex(denunciaId2),
);

console.log('\n=== 8. Revelar autoria de UNA denuncia (staging desde el almacen) ===');
// Tal cual lo va a hacer B3: se lee el registro guardado y se stagea.
const registro1 = {
  secretDenuncia: aHex(stage1.denuncia.secretDenuncia),
  evidenciaHash: aHex(stage1.denuncia.evidenciaHash),
};
check(
  'denunciaIdDeRegistro reconstruye el id desde el almacen',
  aHex(denunciaIdDeRegistro(registro1)) === aHex(denunciaId1),
);
ps = stagearDenunciaGuardada(ps, registro1, denunciaId1);
call('revelarAutoria', denunciaId1, fiscalPk);
const autoriaHash = pureCircuits.autoriaDe(stage1.denuncia.secretDenuncia, denunciaId1, fiscalPk);
check('la autoria quedo registrada', estado().autorias.member(autoriaHash));

console.log('\n--- El momento del video: misma denuncia, dos verificadores ---');
check('FISCAL    -> la autoria verifica', estado().autorias.member(autoriaHash));
check(
  'EMPLEADOR -> el hash es otro y NO esta en el ledger',
  !estado().autorias.member(
    pureCircuits.autoriaDe(stage1.denuncia.secretDenuncia, denunciaId1, empleadorPk),
  ),
);

console.log('\n=== 9. El secret por denuncia acota el dano (H-3) ===');
// Quien recibe el export de la denuncia 1 aprende su secretDenuncia. Ese
// secret NO sirve para la denuncia 2: es el punto de todo el cambio a v2.
checkRechaza(
  'el secret de la denuncia 1 no reclama la autoria de la denuncia 2',
  () => callComo(stagearDenunciaGuardada(ps, registro1), 'revelarAutoria', denunciaId2, fiscalPk),
  'no sos el autor',
);
checkRechaza(
  'un secret inventado tampoco',
  () =>
    callComo(
      stagearDenunciaGuardada(ps, {
        secretDenuncia: bytesAleatorios32(),
        evidenciaHash: evidencia1,
      }),
      'revelarAutoria',
      denunciaId1,
      fiscalPk,
    ),
  'no sos el autor',
);
checkRechaza(
  'el chequeo local ahorra el proving cuando el almacen no coincide',
  () => stagearDenunciaGuardada(ps, registro1, denunciaId2),
  'los secrets guardados no reconstruyen esa denuncia',
);

console.log('\n=== 10. Sin denuncia stageada, los witnesses fallan legible ===');
ps = limpiarDenunciaActiva(ps);
check('denunciaActiva quedo en null', ps.denunciaActiva === null);
checkRechaza(
  'revelarAutoria sin stagear',
  () => call('revelarAutoria', denunciaId1, empleadorPk),
  'no hay denuncia activa en el estado privado',
);
check('no se agrego ninguna autoria', estado().autorias.size() === 1n);

console.log('\n=== 11. El estado privado sobrevive a un round-trip JSON ===');
ps = stagearDenunciaGuardada(ps, registro1, denunciaId1);
const jsonPs = estadoPrivadoAJson(ps);
check('serializa sin bigints sueltos', typeof JSON.stringify(jsonPs) === 'string');
const psVuelta = estadoPrivadoDesdeJson(JSON.parse(JSON.stringify(jsonPs)) as typeof jsonPs);
check(
  'round-trip exacto de la credencial',
  psVuelta.credencialSecret !== null && aHex(psVuelta.credencialSecret) === aHex(credencialSecret),
);
check(
  'round-trip exacto de la denuncia stageada',
  psVuelta.denunciaActiva !== null &&
    aHex(psVuelta.denunciaActiva.denunciaId) === aHex(denunciaId1),
);
check(
  'y el estado deserializado sirve para revelar a otro fiscal',
  (() => {
    try {
      callComo(psVuelta, 'revelarAutoria', denunciaId1, empleadorPk);
      return true;
    } catch {
      return false;
    }
  })(),
);

resumen('selftest witnesses vs simulador');
