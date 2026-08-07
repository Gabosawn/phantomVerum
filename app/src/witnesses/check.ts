// Mini framework de asserts para los selftests de `witnesses/`.
//
// Deliberadamente diminuto: los selftests tienen que poder correr con
// `node app/dist/witnesses/<script>.js`, sin vitest ni ningún runner, para
// que sirvan como evidencia reproducible aunque el resto del toolchain esté
// a medio armar. La suite formal del proyecto vive en `tests/` (bloque D).
//
// Mismo formato de salida que `contracts/test/harness.mjs`, para que los dos
// se lean igual en la terminal durante la demo.

let corridos = 0;
let fallos = 0;

export function check(nombre: string, cond: boolean, detalle = ''): void {
  corridos++;
  if (cond) console.log(`  ok    ${nombre}${detalle ? ` (${detalle})` : ''}`);
  else {
    fallos++;
    console.log(`  FAIL  ${nombre}${detalle ? ` (${detalle})` : ''}`);
  }
}

/** Espera que `fn` lance y que el mensaje contenga `fragmento`. */
export function checkRechaza(nombre: string, fn: () => unknown, fragmento: string): void {
  corridos++;
  try {
    fn();
    fallos++;
    console.log(`  FAIL  ${nombre} -> no lanzó (se esperaba "${fragmento}")`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(fragmento)) {
      fallos++;
      console.log(`  FAIL  ${nombre} -> lanzó "${msg}", se esperaba "${fragmento}"`);
    } else {
      console.log(`  ok    ${nombre} -> rechazado: ${msg.split('\n')[0]}`);
    }
  }
}

/** Igual que `checkRechaza` para promesas. */
export async function checkRechazaAsync(
  nombre: string,
  fn: () => Promise<unknown>,
  fragmento: string,
): Promise<void> {
  corridos++;
  try {
    await fn();
    fallos++;
    console.log(`  FAIL  ${nombre} -> no lanzó (se esperaba "${fragmento}")`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(fragmento)) {
      fallos++;
      console.log(`  FAIL  ${nombre} -> lanzó "${msg}", se esperaba "${fragmento}"`);
    } else {
      console.log(`  ok    ${nombre} -> rechazado: ${msg.split('\n')[0]}`);
    }
  }
}

/** Devuelve el mensaje del error que lanzó `fn`, o null si no lanzó. */
export function mensajeDeError(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Imprime el resumen y termina el proceso con exit code 0/1. */
export function resumen(titulo: string): never {
  console.log(
    `\n=== ${titulo}: ${corridos - fallos}/${corridos} ${fallos === 0 ? 'OK' : `— ${fallos} FALLOS`} ===`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}
