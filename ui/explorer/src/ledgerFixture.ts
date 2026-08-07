/**
 * Lo que el indexer devolvería para el período de la demo.
 *
 * TODO lo de este archivo es público: son hashes que están publicados en la
 * cadena. El Explorer no importa NADA de `cliente/` — no tiene acceso a ningún
 * secret, y por eso no puede decirte quién escribió ninguna de estas denuncias.
 *
 * Los valores están horneados en vez de calculados para que el Explorer no
 * necesite el secret de demo ni para sembrarse. `ledgerFixture.test.ts`
 * recomputa los dos importantes desde el PDF de muestra: si alguien regenera
 * las muestras, falla el test en vez de ponerse rojo el video.
 *
 * Fabricado y declarado como tal: las alturas de bloque y el estado
 * "sincronizado" del indexer. No hay cadena atrás de esto todavía.
 */

import type { FilaDenuncia, Hex32 } from "@shared/tipos";

export const ALTURA_ACTUAL = 1_284_931;

/**
 * Ojo con lo que NO está acá: el hash de la evidencia.
 *
 * `evidenciaHash` nunca se publica — al ledger va sólo
 * `reportId = H(dom ‖ evidenciaHash ‖ secret)`. Por eso verificar el sello
 * (T3) exige que el denunciante te entregue su material: sin el secret, ni
 * siquiera sabiendo el documento podés reproducir el valor sellado. Y por eso
 * mismo la empresa no puede probar cuál documento corresponde a cuál denuncia.
 */

/** reportIdOf(hash de la evidencia, secret del denunciante de la demo). */
export const DENUNCIA_DEMO: Hex32 =
  "56e4da144e489f73cfc304cc58b10be3511fc93e936f5c6561f1700a6c57336b";

/** nullifierOf(credSecret de la demo, ORG_ID, DEMO_EPOCH). */
export const NULLIFIER_DEMO: Hex32 =
  "a1654dee6068682d6a652bf6baa4be8f3507705f97c4605e1c74eaa05c6f670d";

/** authorshipOf(secret, DENUNCIA_DEMO, pk de la Fiscalía). */
export const AUTORIA_DEMO_PIA: Hex32 =
  "0f3532bfa6120ef5bf1d1f5b2c36bc368ac84c0d618dd84b4847aeed2c143646";

/**
 * Tres denuncias del mismo período. La primera es la de la demo; las otras dos
 * son de otras personas. Desde acá son indistinguibles — que es exactamente lo
 * que se quiere demostrar.
 */
export const DENUNCIAS: FilaDenuncia[] = [
  { denunciaId: DENUNCIA_DEMO, nullifier: NULLIFIER_DEMO, bloque: 1_284_924 },
  {
    denunciaId: "a4db18da9427063f74735ee678a9a8cc2e4a16545a8e064db79cb94cf1504391",
    nullifier: "098b13c787e6562b9bf70d950fb2b7b804c49b35d385f9b6062f49e140136b10",
    bloque: 1_281_402,
  },
  {
    denunciaId: "ee6b51a97e79e55821787ad5ea2368e73a263d9e7dfc2144fc7a70a0d677b829",
    nullifier: "592e7cb9345070b5ba60a971247d87b0769226bac61394e3e6b71166ac52e56a",
    bloque: 1_276_885,
  },
];

export const AUTORIAS: Hex32[] = [AUTORIA_DEMO_PIA];
