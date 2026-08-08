/**
 * Constantes PÚBLICAS de la demo — las puede tener cualquiera.
 *
 * Todo lo que es secreto (el secret personal del denunciante y los secrets de
 * las credenciales del directorio de ACME) vive en `cliente/src/demoPrivado.ts`
 * y el Explorer no lo importa. Esa frontera es el producto: si el Explorer
 * necesitara algo de ese archivo, el discurso entero se caería.
 */

import { epochLabel } from "./formato";
import type { Hex32, Verificador } from "./tipos";

export const ORG_NOMBRE = "ACME S.A.";

/**
 * The reporting epoch of the seeded demo report: `floor(unixSeconds / 86400)`
 * for 2026-08-07 UTC. Periods are EPOCH INDEXES bound to the chain clock —
 * the contract's C0 rejects any other value — so the Explorer fixture pins
 * the epoch its baked-in nullifier was derived from.
 */
export const DEMO_EPOCH = 20672;

/** Display label for the demo epoch (what the Explorer shows as the period). */
export const PERIODO = epochLabel(DEMO_EPOCH);

export const ORG_ID: Hex32 = "9c41e2b7159e8c80e81a49b4ff962258c96e7b463443bb64a24057aebbcad80a";
export const ANCLA: Hex32 = "90fef7a77ef42480005fffd13b8ac0107f08f19383ee5e45edd0be233d5d3b34";

/** A quién puede designar el denunciante. */
export const VERIFICADORES: Verificador[] = [
  {
    id: "pia",
    nombre: "Fiscalía de Investigaciones Administrativas",
    nonce: "7d15c80d067698a0e5e7b1cbfcdb285d3ac658b703df68616c9544fd93209a2f",
  },
  {
    id: "prensa",
    nombre: "Consorcio de periodistas · verificación",
    nonce: "2ef430803521ed2b05a9d24bb546a7f4282fc5bdda2b5ef14d73f956b83c71bd",
  },
  {
    id: "sindicato",
    nombre: "Comisión interna del sindicato",
    nonce: "9a04ccf168e6279dd444ac3017e5dcdaef1ae9b4c6ac4606ed40c1778d955e63",
  },
];

/** El que intercepta la prueba y no puede hacer nada con ella. */
export const PK_ACME_LEGAL: Hex32 =
  "3b92af1fe656626d02dff0abcd50b545ce9166f3d6c008dd350133d9753ac410";

export const MUESTRA_ORIGINAL = {
  nombre: "contrato-obra-4471.pdf",
  ruta: "/muestras/contrato-obra-4471.pdf",
  descripcion: "el archivo que subió el denunciante",
} as const;

export const MUESTRA_ALTERADA = {
  nombre: "contrato-obra-4471 (rev-legal).pdf",
  ruta: "/muestras/contrato-obra-4471-rev-legal.pdf",
  descripcion: `la versión que presenta ${ORG_NOMBRE} · un byte distinto`,
} as const;

/** Dónde vive la otra app. Es el único acoplamiento entre las dos. */
export const URL_CLIENTE = "http://localhost:3000";
export const URL_EXPLORER = "http://localhost:3001";
