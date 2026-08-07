// Adversarial checks for testigo.compact. Read-only against the compiled output.
import { Contract, ledger as leerLedger, pureCircuits } from './generated/index.js';
import { createConstructorContext, createCircuitContext, sampleContractAddress } from '@midnight-ntwrk/compact-runtime';

const b32 = (f) => Uint8Array.from({ length: 32 }, (_, i) => (f + i) % 256);
const hex = (u8) => Buffer.from(u8).toString('hex');

function mk(secrets) {
  let leafFor = () => null;
  const w = {
    credencialSecret: (c) => [c.privateState, secrets.cred],
    secretPersonal: (c) => [c.privateState, secrets.sec],
    evidenciaHash: (c) => [c.privateState, secrets.ev],
    credencialPath: (c) => {
      const p = c.ledger.credenciales.findPathForLeaf(leafFor());
      if (!p) throw new Error('sin credencial');
      return [c.privateState, p.path];
    },
  };
  return { w, setLeaf: (f) => { leafFor = f; } };
}

const orgA = b32(0x11), orgB = b32(0xb0), ancla = b32(0xaa);
const cred = b32(0x22), sec = b32(0x44), ev = b32(0x33);
const secrets = { cred, sec, ev };
const { w, setLeaf } = mk(secrets);
const contrato = new Contract(w);
const init = contrato.initialState(createConstructorContext({}, '0'.repeat(64)));
let ctx = createCircuitContext(sampleContractAddress(), init.currentZswapLocalState, init.currentContractState, init.currentPrivateState);
const st = () => leerLedger(ctx.currentQueryContext.state);
const call = (n, ...a) => { const r = contrato.impureCircuits[n](ctx, ...a); ctx = r.context; return r; };

console.log('### A. Public transcript of denunciar: does orgId/periodo appear?');
call('registrarOrganizacion', orgA, ancla);
const hojaA = pureCircuits.hojaDe(orgA, cred);
setLeaf(() => hojaA);
call('emitirCredencial', orgA, hojaA);
const periodo = b32(0x55);
const r = call('denunciar', orgA, periodo);
const tx = r.proofData ?? r;
const dump = JSON.stringify(tx, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
console.log('  result keys:', Object.keys(r));
console.log('  transcript contains orgId hex? ', dump.includes(hex(orgA)));
console.log('  transcript contains periodo hex? ', dump.includes(hex(periodo)));
console.log('  transcript contains denunciaId? ', dump.includes(hex(pureCircuits.denunciaIdDe(ev, sec))));
console.log('  transcript contains nullifier? ', dump.includes(hex(pureCircuits.nullifierDe(cred, orgA, periodo))));
console.log('  transcript len', dump.length);
console.log('  --- publicTranscript excerpt ---');
console.log(dump.slice(0, 2500));

console.log('\n### B. periodo is caller-chosen -> anti-spam bypass');
let n = 0;
for (const p of [b32(0x56), b32(0x57), b32(0x58)]) {
  secrets.ev = b32(0x33 + ++n); // distinct evidence -> distinct denunciaId
  try { call('denunciar', orgA, p); console.log(`  denuncia extra con periodo ${hex(p).slice(0, 8)}: ACEPTADA`); }
  catch (e) { console.log(`  rechazada: ${String(e.message).split('\n')[0]}`); }
}
console.log('  denuncias.size =', st().denuncias.size(), ' nullifiers.size =', st().nullifiers.size());

console.log('\n### C. emitirCredencial: orgId param is not bound to the leaf');
const hojaB = pureCircuits.hojaDe(orgB, cred); // orgB NEVER registered
console.log('  organizaciones.member(orgB) =', st().organizaciones.member(orgB));
call('emitirCredencial', orgA, hojaB); // pass registered orgA, insert a leaf for orgB
setLeaf(() => hojaB);
secrets.ev = b32(0x77);
try { call('denunciar', orgB, b32(0x59)); console.log('  denunciar(orgB) ACEPTADA -> credencial forjada para una org no registrada'); }
catch (e) { console.log('  rechazada:', String(e.message).split('\n')[0]); }

console.log('\n### D. Whoever holds the export {secret, evidenciaHash} can act as the author');
setLeaf(() => hojaA); secrets.ev = b32(0x33); // back to the original denuncia
const denunciaId = pureCircuits.denunciaIdDe(b32(0x33), sec);
console.log('  denuncias.member(denunciaId) =', st().denuncias.member(denunciaId));
const fiscalPk = b32(0x66), empleadorPk = b32(0x88), fiscal2 = b32(0x99);
// the "fiscal" builds his own Contract with the leaked witnesses
const fiscalCtr = new Contract({
  credencialSecret: (c) => [c.privateState, b32(0)],
  credencialPath: (c) => [c.privateState, []],
  secretPersonal: (c) => [c.privateState, sec],
  evidenciaHash: (c) => [c.privateState, b32(0x33)],
});
try {
  const rr = fiscalCtr.impureCircuits.revelarAutoria(ctx, denunciaId, empleadorPk);
  ctx = rr.context;
  console.log('  fiscal republished authorship to EMPLEADOR pk: ACCEPTED');
  console.log('  autorias.member(autoria(sec,id,empleadorPk)) =', st().autorias.member(pureCircuits.autoriaDe(sec, denunciaId, empleadorPk)));
} catch (e) { console.log('  rejected:', String(e.message).split('\n')[0]); }
// pre-burn the author's future reveal to fiscal2
try {
  const rr = fiscalCtr.impureCircuits.revelarAutoria(ctx, denunciaId, fiscal2);
  ctx = rr.context;
  console.log('  fiscal pre-burned the (denuncia, fiscal2) slot: ACCEPTED');
} catch (e) { console.log('  rejected:', String(e.message).split('\n')[0]); }
try { call('revelarAutoria', denunciaId, fiscal2); console.log('  FAIL author could still reveal to fiscal2'); }
catch (e) { console.log('  author now PERMANENTLY blocked from revealing to fiscal2:', String(e.message).split('\n')[0]); }

console.log('\n### E. Merkle root as a sync-counter (root changes per insert; history keeps them all)');
const roots = [];
for (let i = 0; i < 4; i++) {
  call('emitirCredencial', orgA, b32(0xc0 + i));
  roots.push(JSON.stringify(st().credenciales.root(), (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
console.log('  distinct roots after 4 inserts:', new Set(roots).size, '/ 4');
const hist = [...{ [Symbol.iterator]: () => st().credenciales.history() }];
console.log('  history length =', hist.length, '(every past root stays acceptable to checkRoot)');
