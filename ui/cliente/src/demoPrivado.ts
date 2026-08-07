/**
 * Estado PRIVADO de la demo. Sólo el Cliente.
 *
 * Si algún día este archivo aparece importado desde `explorer/`, el producto
 * dejó de ser lo que dice ser. Hay un chequeo de eso en la verificación del
 * Bloque C.
 *
 * En modo demo (los botones T1/T2/T4 del terminal) se usa el secret fijo de
 * abajo, para que el `denunciaId` resultante coincida con el que el Explorer
 * tiene indexado y la toma grabada cierre siempre en verde. En juego libre el
 * Cliente genera un secret aleatorio y el Explorer, correctamente, dirá que no
 * conoce esa denuncia.
 */

import type { Hex32 } from "@shared/tipos";

/** El secret personal del denunciante de la demo. Persiste entre T2 y T4. */
export const SECRET_PERSONAL_DEMO: Hex32 =
  "6b0de43db76ce5c0cff03c37a0221b65a2a03493b4250c38c6192ceda10c17ae";

/**
 * El directorio interno de ACME. Nunca se publica: al ledger va sólo el ancla,
 * que es la raíz del árbol de estas hojas.
 */
export const DIRECTORIO: { nombre: string; rol: string; credencialSecret: Hex32 }[] = [
  {
    nombre: "M. Sosa",
    rol: "Compras",
    credencialSecret: "1f8aff942309ee1449eb89a7c03318ccb838bba30f74d2c547565b9483d9be04",
  },
  {
    nombre: "R. Ferreyra",
    rol: "Contabilidad",
    credencialSecret: "93c2be5e90d25b86e7675754a4e161ab15e2cfe325d2d8feb94aacf3d8b27d51",
  },
  {
    nombre: "L. Quiroga",
    rol: "Obras",
    credencialSecret: "4e7038efbd4f620a7bd88aa10e3d0a1fd5ac95b9e1fadedf4737f83bfecba2bc",
  },
  {
    nombre: "D. Ibarra",
    rol: "Legales",
    credencialSecret: "a5d94a99acc09dcdf6d834178d1b0d7cb1b1d1e43ce797d2be0963d543cc3f18",
  },
];

/** Quién denuncia en la demo: el de Obras, que es quien ve el expediente. */
export const EMPLEADO_DEMO = DIRECTORIO[2];
