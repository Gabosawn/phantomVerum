// Selftest de B2.1 (secrets) + B2.2 (evidencia) + los helpers de época.
//
// No toca red, ni el contrato compilado, ni los secrets reales del
// denunciante: trabaja entero sobre un directorio temporal. El selftest del
// witness contra el simulador va aparte, en `selftest-simulador.ts`.
//
//   npm run build --workspace=app && node app/dist/witnesses/selftest.js

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { check, checkRechaza, checkRechazaAsync, resumen } from './check.js';
import {
  DURACION_EPOCA_SEG,
  epocaActual,
  epocaDeSegundos,
  finDeEpoca,
  inicioDeEpoca,
  periodoAJson,
  periodoDesdeJson,
} from './epoca.js';
import { hashEvidenciaArchivo, hashEvidenciaBytes, resumenEvidencia } from './evidencia.js';
import { aBytes32, aHex, bytesAleatorios32, esHex32 } from './hex.js';
import {
  SecretsCorruptosError,
  agregarDenuncia,
  crearSecrets,
  existenSecrets,
  fijarHojaIndex,
  leerSecrets,
  listarDenuncias,
  nuevoSecretDenuncia,
  obtenerDenuncia,
  periodoDeRegistro,
  rutaSecrets,
} from './secrets.js';

// ── fixtures ────────────────────────────────────────────────────────────
const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testigo-selftest-'));
const rutaTmp = path.join(dirTmp, 'secrets', 'denunciante.json');
const orgId = aHex(Uint8Array.from({ length: 32 }, (_, i) => (0x11 + i) % 256));

async function main(): Promise<void> {
  console.log(`=== 1. Ubicación y ciclo de vida del almacén (B2.1) ===`);
  console.log(`  ruta por defecto: ${rutaSecrets()}`);
  check(
    'la ruta por defecto cuelga de la raíz del repo, no del cwd',
    rutaSecrets().endsWith(path.join('secrets', 'denunciante.json')) &&
      path.isAbsolute(rutaSecrets()),
  );
  check('sin archivo -> existenSecrets false', !existenSecrets(rutaTmp));
  check('sin archivo -> leerSecrets devuelve null', leerSecrets(rutaTmp) === null);

  const creado = crearSecrets(orgId, rutaTmp);
  check('crearSecrets deja el archivo en disco', existenSecrets(rutaTmp));
  check('version 2', creado.version === 2, String(creado.version));
  check('credencialSecret es hex de 64 chars', esHex32(creado.credencialSecret));
  check('orgId se preservó', creado.orgId === orgId);
  check('hojaIndex arranca en null', creado.hojaIndex === null);
  check('sin denuncias todavía', Object.keys(creado.denuncias).length === 0);

  const modo = fs.statSync(rutaTmp).mode & 0o777;
  check('permisos del archivo = 0600', modo === 0o600, `0${modo.toString(8)}`);
  const modoDir = fs.statSync(path.dirname(rutaTmp)).mode & 0o777;
  check('permisos del directorio = 0700', modoDir === 0o700, `0${modoDir.toString(8)}`);

  console.log('\n=== 2. Relectura y entropía ===');
  const releido = leerSecrets(rutaTmp);
  check('relectura no es null', releido !== null);
  check(
    'round-trip exacto',
    releido !== null &&
      releido.credencialSecret === creado.credencialSecret &&
      releido.orgId === creado.orgId &&
      releido.hojaIndex === creado.hojaIndex,
  );

  const rutaOtro = path.join(dirTmp, 'otro', 'denunciante.json');
  const otro = crearSecrets(orgId, rutaOtro);
  check(
    'dos credenciales -> secrets distintos (randomBytes, no derivación)',
    otro.credencialSecret !== creado.credencialSecret,
  );

  console.log('\n=== 3. hojaIndex y registro de denuncias ===');
  const conHoja = fijarHojaIndex(3, rutaTmp);
  check('fijarHojaIndex persiste', conHoja.hojaIndex === 3);
  check('y sobrevive a la relectura', leerSecrets(rutaTmp)?.hojaIndex === 3);

  // Un ciclo de denuncia como lo va a hacer B3: secret FRESCO por denuncia.
  const secretDenuncia1 = nuevoSecretDenuncia();
  const secretDenuncia2 = nuevoSecretDenuncia();
  check(
    'cada denuncia recibe un secret distinto (H-3: nunca uno global)',
    aHex(secretDenuncia1) !== aHex(secretDenuncia2),
  );

  const evHash1 = hashEvidenciaBytes(Buffer.from('sumario interno 2026'));
  const denunciaId1 = bytesAleatorios32(); // en B3 sale de pureCircuits.denunciaIdDe
  const periodo1 = epocaActual();

  agregarDenuncia(
    denunciaId1,
    { secretDenuncia: secretDenuncia1, evidenciaHash: evHash1, periodo: periodo1 },
    rutaTmp,
  );
  const leido1 = obtenerDenuncia(denunciaId1, rutaTmp);
  check('la denuncia se puede consultar por denunciaId', leido1 !== null);
  check(
    'secretDenuncia round-trip',
    leido1?.secretDenuncia === aHex(secretDenuncia1),
  );
  check('evidenciaHash round-trip', leido1?.evidenciaHash === aHex(evHash1));
  check(
    'periodo round-trip como bigint (no rompe JSON.stringify)',
    leido1 !== null && periodoDeRegistro(leido1) === periodo1,
    `periodo=${periodo1}`,
  );
  check('una denuncia consultada que no existe -> null', obtenerDenuncia(bytesAleatorios32(), rutaTmp) === null);

  agregarDenuncia(
    bytesAleatorios32(),
    { secretDenuncia: secretDenuncia2, evidenciaHash: hashEvidenciaBytes(Buffer.from('otro')) },
    rutaTmp,
  );
  check('listarDenuncias devuelve las 2', listarDenuncias(rutaTmp).length === 2);

  // Idempotencia y protección contra sobrescritura.
  agregarDenuncia(
    denunciaId1,
    { secretDenuncia: secretDenuncia1, evidenciaHash: evHash1, periodo: periodo1 },
    rutaTmp,
  );
  check('re-registrar los mismos valores es idempotente', listarDenuncias(rutaTmp).length === 2);
  checkRechaza(
    'pisar una denuncia con otro secret se rechaza (sería irrecuperable)',
    () =>
      agregarDenuncia(
        denunciaId1,
        { secretDenuncia: secretDenuncia2, evidenciaHash: evHash1 },
        rutaTmp,
      ),
    'ya está registrada con otros secrets',
  );

  console.log('\n=== 4. El archivo en disco tiene el formato §3.2 congelado ===');
  const enDisco: unknown = JSON.parse(fs.readFileSync(rutaTmp, 'utf8'));
  const claves = Object.keys(enDisco as object).sort();
  check(
    'claves de nivel superior exactas',
    JSON.stringify(claves) ===
      JSON.stringify(['credencialSecret', 'denuncias', 'hojaIndex', 'orgId', 'version']),
    claves.join(','),
  );
  check(
    'NO hay un secretPersonal global (el formato v1 inseguro, H-3)',
    !Object.prototype.hasOwnProperty.call(enDisco, 'secretPersonal'),
  );

  console.log('\n=== 5. Se falla cerrado ante secrets corruptos ===');
  const rutaV1 = path.join(dirTmp, 'v1', 'denunciante.json');
  fs.mkdirSync(path.dirname(rutaV1), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    rutaV1,
    JSON.stringify({ version: 1, secretPersonal: aHex(bytesAleatorios32()) }),
    { mode: 0o600 },
  );
  checkRechaza('un almacén v1 no se lee en silencio', () => leerSecrets(rutaV1), 'version 1');

  const rutaRota = path.join(dirTmp, 'rota', 'denunciante.json');
  fs.mkdirSync(path.dirname(rutaRota), { recursive: true, mode: 0o700 });
  fs.writeFileSync(rutaRota, '{ no es json', { mode: 0o600 });
  checkRechaza('JSON ilegible se reporta', () => leerSecrets(rutaRota), 'JSON ilegible');

  const rutaCampo = path.join(dirTmp, 'campo', 'denunciante.json');
  fs.mkdirSync(path.dirname(rutaCampo), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    rutaCampo,
    JSON.stringify({
      version: 2,
      credencialSecret: 'ZZ',
      orgId,
      hojaIndex: null,
      denuncias: {},
    }),
    { mode: 0o600 },
  );
  checkRechaza(
    'un hex inválido se detecta al leer, no adentro del circuito',
    () => leerSecrets(rutaCampo),
    'credencialSecret',
  );
  check(
    'el error es de tipo SecretsCorruptosError',
    (() => {
      try {
        leerSecrets(rutaCampo);
        return false;
      } catch (e) {
        return e instanceof SecretsCorruptosError;
      }
    })(),
  );

  console.log('\n=== 6. Permisos laxos se corrigen al leer ===');
  fs.chmodSync(rutaTmp, 0o644);
  leerSecrets(rutaTmp);
  check(
    'un archivo 0644 vuelve a 0600',
    (fs.statSync(rutaTmp).mode & 0o777) === 0o600,
  );

  console.log('\n=== 7. Hash de evidencia (B2.2) ===');
  const rutaEvidencia = path.join(dirTmp, 'evidencia.txt');
  fs.writeFileSync(rutaEvidencia, 'abc');
  // Vector conocido de sha-256("abc") — publicado, no calculado por este
  // código: si algún día alguien cambia el algoritmo, este check lo caza.
  const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const h1 = await hashEvidenciaArchivo(rutaEvidencia);
  check('sha-256 de un archivo conocido coincide con el vector público', aHex(h1) === SHA256_ABC, aHex(h1));
  check('el digest son 32 bytes', h1.length === 32);

  const h2 = await hashEvidenciaArchivo(rutaEvidencia);
  check('determinístico: mismo archivo -> mismo hash', aHex(h1) === aHex(h2));

  const rutaCopia = path.join(dirTmp, 'copia-con-otro-nombre.txt');
  fs.writeFileSync(rutaCopia, 'abc');
  check(
    'el nombre del archivo no entra al hash',
    aHex(await hashEvidenciaArchivo(rutaCopia)) === SHA256_ABC,
  );
  check(
    'hashEvidenciaBytes coincide con hashEvidenciaArchivo',
    aHex(hashEvidenciaBytes(Buffer.from('abc'))) === SHA256_ABC,
  );

  // Archivo grande: el stream no debe cambiar el resultado.
  const grande = Buffer.alloc(3 * 1024 * 1024, 7);
  const rutaGrande = path.join(dirTmp, 'grande.bin');
  fs.writeFileSync(rutaGrande, grande);
  check(
    'un archivo de 3 MB hashea igual por stream que en memoria',
    aHex(await hashEvidenciaArchivo(rutaGrande)) === aHex(hashEvidenciaBytes(grande)),
  );

  const resumen1 = await resumenEvidencia(rutaEvidencia);
  check('resumenEvidencia reporta nombre y tamaño locales', resumen1.nombre === 'evidencia.txt' && resumen1.bytes === 3);
  check('resumenEvidencia.hashHex coincide', resumen1.hashHex === SHA256_ABC);

  await checkRechazaAsync(
    'un archivo inexistente rechaza con error legible',
    () => hashEvidenciaArchivo(path.join(dirTmp, 'no-existe.pdf')),
    'no se pudo leer la evidencia',
  );

  console.log('\n=== 8. Épocas (periodo: Uint<64> -> bigint) ===');
  check('duración de época = 86400 s', DURACION_EPOCA_SEG === 86400n);
  check('epocaDeSegundos(0) = 0', epocaDeSegundos(0) === 0n);
  check('epocaDeSegundos(86399) = 0', epocaDeSegundos(86399) === 0n);
  check('epocaDeSegundos(86400) = 1', epocaDeSegundos(86400) === 1n);
  check('inicioDeEpoca(1) = 86400', inicioDeEpoca(1n) === 86400n);
  check('finDeEpoca(1) = 172800', finDeEpoca(1n) === 172800n);
  const ahora = epocaActual();
  check(
    'la época actual cae dentro de su propia ventana',
    inicioDeEpoca(ahora) <= BigInt(Math.floor(Date.now() / 1000)) &&
      BigInt(Math.floor(Date.now() / 1000)) < finDeEpoca(ahora),
    `epoca=${ahora}`,
  );
  check(
    'la época actual es plausible (> 20000 días desde 1970, < año 2100)',
    ahora > 20000n && ahora < 47500n,
    `epoca=${ahora} — si esto falla, alguien pasó milisegundos`,
  );
  check('periodo serializa como decimal', periodoAJson(19945n) === '19945');
  check('y deserializa a bigint', periodoDesdeJson('19945') === 19945n);
  checkRechaza('un periodo no numérico se rechaza', () => periodoDesdeJson('19945.0'), 'no es un periodo válido');

  console.log('\n=== 9. Conversión hex <-> bytes ===');
  const bytes = bytesAleatorios32();
  check('round-trip bytes -> hex -> bytes', aHex(aBytes32(aHex(bytes))) === aHex(bytes));
  check('aHex produce 64 chars', aHex(bytes).length === 64);
  checkRechaza('hex corto se rechaza', () => aBytes32('abcd'), 'no es un Hex32 válido');
  checkRechaza(
    'hex con caracteres inválidos se rechaza (Buffer.from truncaría en silencio)',
    () => aBytes32(`zz${'0'.repeat(62)}`),
    'no es un Hex32 válido',
  );
  checkRechaza('hex en mayúsculas se rechaza (formato canónico)', () => aBytes32('A'.repeat(64)), 'no es un Hex32 válido');
}

main()
  .then(() => {
    fs.rmSync(dirTmp, { recursive: true, force: true });
    resumen('selftest secrets + evidencia');
  })
  .catch((e: unknown) => {
    fs.rmSync(dirTmp, { recursive: true, force: true });
    console.error('\nselftest abortado:', e);
    process.exit(1);
  });
