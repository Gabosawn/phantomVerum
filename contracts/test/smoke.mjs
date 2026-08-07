// A.6 — smoke de los pure circuits del módulo TS generado.
// Corre sin estado ni contexto: son funciones puras.

import { pureCircuits, b32, hex, check, resumen, EPOCA } from './harness.mjs';

const orgId = b32(0x11);
const credSecret = b32(0x22);
const evidencia = b32(0x33);
const secret = b32(0x44);
const fiscalPk = b32(0x66);
const credComm = pureCircuits.credCommitmentDe(credSecret);

const casos = [
  ['credCommitmentDe', () => pureCircuits.credCommitmentDe(credSecret)],
  ['hojaDe', () => pureCircuits.hojaDe(orgId, credComm)],
  ['denunciaIdDe', () => pureCircuits.denunciaIdDe(evidencia, secret)],
  ['nullifierDe', () => pureCircuits.nullifierDe(credSecret, orgId, EPOCA)],
  ['autoriaDe', () => pureCircuits.autoriaDe(secret, b32(0x77), fiscalPk)],
];

console.log('=== 1. Los pure circuits devuelven Bytes<32> ===');
const salidas = {};
for (const [nombre, fn] of casos) {
  const out = fn();
  salidas[nombre] = out;
  console.log(`${nombre.padEnd(17)} -> ${hex(out)}`);
  check(`${nombre}: Uint8Array de 32 bytes`, out instanceof Uint8Array && out.length === 32);
}

console.log('\n=== 2. Determinismo ===');
for (const [nombre, fn] of casos) {
  check(`${nombre}: determinista`, hex(fn()) === hex(salidas[nombre]));
}

console.log('\n=== 3. Sensibilidad a la entrada ===');
check(
  'denunciaIdDe cambia con el secret',
  hex(pureCircuits.denunciaIdDe(evidencia, b32(0x45))) !== hex(salidas.denunciaIdDe),
);
check(
  'nullifierDe cambia con la epoca',
  hex(pureCircuits.nullifierDe(credSecret, orgId, EPOCA + 1n)) !== hex(salidas.nullifierDe),
);

console.log('\n=== 4. Domain separation (plan §2.2) ===');
// Mismos inputs en las mismas posiciones, distinto tag de dominio: es el
// ataque de colisión cruzada que describe el plan (registrar una org con
// orgId = denunciaId). Los tags lo hacen imposible.
const secComoBytes = b32(0x44);
const a = pureCircuits.autoriaDe(secComoBytes, orgId, b32(0x66));
const b = pureCircuits.denunciaIdDe(secComoBytes, orgId);
check('autoriaDe != denunciaIdDe con inputs solapados', hex(a) !== hex(b));
check(
  'hojaDe(org, cred) != credCommitmentDe(cred)',
  hex(pureCircuits.hojaDe(orgId, credComm)) !== hex(credComm),
);

resumen('smoke');
