/**
 * The five-step walkthrough, as pure functions.
 *
 * It lives outside `estado.tsx` on purpose: the fact that a step cannot be
 * skipped is a product claim, not a presentation detail, and here it can be
 * checked by a test instead of by eye (`pruebas/recorrido.test.ts`).
 */

import type { NumeroPaso } from "@shared/guia";

import type { Fase, Ruta } from "./estado";

/** The only part of the Cliente's state the walkthrough depends on. */
export type EstadoRecorrido = {
  /** How many credentials the company issued. 0 = step 1 is still pending. */
  hojasEmitidas: number;
  /** Whether the local ledger already holds a sealed report, this session or not. */
  hayDenuncias: boolean;
  /** Whether an authorship key is in memory (signed here or loaded from disk). */
  tieneLlave: boolean;
  llaveGuardada: boolean;
  faseDenuncia: Fase;
  faseRevelar: Fase;
};

/**
 * Which of the five steps the story is standing on. DERIVED from real state: if
 * it says there is a key it is because there was a report, so the bar cannot
 * claim progress that never happened.
 */
export function pasoActual(e: EstadoRecorrido): NumeroPaso {
  if (e.hojasEmitidas === 0) return 1;
  if (!e.tieneLlave) return 2;
  if (e.faseDenuncia === "listo" && !e.llaveGuardada) return 3;
  if (e.faseRevelar !== "listo") return 4;
  return 5;
}

/**
 * Which screens are locked, and why. The value is the reason rather than a
 * boolean, because the reason is what gets displayed: a dead tab with no
 * explanation was exactly the problem this fixes.
 */
export function candados(e: EstadoRecorrido): Record<Ruta, string | null> {
  return {
    emitir: null,
    denunciar:
      e.hojasEmitidas === 0
        ? "Se abre cuando la empresa emite las credenciales, en el paso 1."
        : null,
    // Step 4 opens with the first sealed report and does NOT close again even
    // if the page is reloaded with no key in memory: that is exactly the case
    // the product is about — you come back months later with your .key file —
    // and locking it would make that unreachable.
    revelar:
      !e.tieneLlave && !e.hayDenuncias
        ? "Se abre cuando hay una denuncia sellada, en el paso 2. Después vas a poder volver acá con tu archivo .key."
        : null,
  };
}
