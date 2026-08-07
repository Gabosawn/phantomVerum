// A.6 — smoke del modulo TS generado por `compact compile`.
// Invoca los 4 pure circuits exportados con valores dummy de 32 bytes.
// No toca el repo: el output generado esta copiado en ./generated/.

import { pureCircuits } from './generated/index.js';

const b32 = (fill) => Uint8Array.from({ length: 32 }, (_, i) => (fill + i) % 256);
const hex = (u8) => Buffer.from(u8).toString('hex');

const orgId      = b32(0x11);
const credSecret = b32(0x22);
const evidencia  = b32(0x33);
const secret     = b32(0x44);
const periodo    = b32(0x55);
const fiscalPk   = b32(0x66);

let fallos = 0;
const check = (nombre, cond) => {
  if (!cond) { fallos++; console.log(`  FAIL  ${nombre}`); }
  else       { console.log(`  ok    ${nombre}`); }
};

const casos = [
  ['hojaDe',       () => pureCircuits.hojaDe(orgId, credSecret)],
  ['denunciaIdDe', () => pureCircuits.denunciaIdDe(evidencia, secret)],
  ['nullifierDe',  () => pureCircuits.nullifierDe(credSecret, orgId, periodo)],
  ['autoriaDe',    () => pureCircuits.autoriaDe(secret, b32(0x77), fiscalPk)],
];

console.log('=== 1. Los 4 pure circuits devuelven Bytes<32> ===');
const salidas = {};
for (const [nombre, fn] of casos) {
  const out = fn();
  salidas[nombre] = out;
  console.log(`${nombre.padEnd(14)} -> ${hex(out)}`);
  check(`${nombre}: es Uint8Array`, out instanceof Uint8Array);
  check(`${nombre}: 32 bytes`, out.length === 32);
}

console.log('\n=== 2. Determinismo (misma entrada -> misma salida) ===');
for (const [nombre, fn] of casos) {
  check(`${nombre}: determinista`, hex(fn()) === hex(salidas[nombre]));
}

console.log('\n=== 3. Sensibilidad a la entrada (1 bit distinto -> hash distinto) ===');
const otroSecret = b32(0x45);
check(
  'denunciaIdDe cambia con el secret',
  hex(pureCircuits.denunciaIdDe(evidencia, otroSecret)) !== hex(salidas.denunciaIdDe),
);

console.log('\n=== 4. Domain separation (plan §2.2) ===');
// Mismos 3 inputs en las mismas posiciones, distinto tag de dominio.
// Es el ataque descrito en el plan: registrar una org con orgId = denunciaId
// para forzar una colision cruzada nullifier/autoria.
const a = pureCircuits.nullifierDe(secret, orgId, periodo);
const b = pureCircuits.autoriaDe(secret, orgId, periodo);
console.log(`nullifierDe(s,x,y) -> ${hex(a)}`);
console.log(`autoriaDe  (s,x,y) -> ${hex(b)}`);
check('nullifier != autoria con inputs identicos', hex(a) !== hex(b));

console.log(`\n=== RESULTADO: ${fallos === 0 ? 'OK' : fallos + ' FALLOS'} ===`);
process.exit(fallos === 0 ? 0 : 1);
