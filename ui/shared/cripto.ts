/**
 * ★ Éste es el único módulo que se reemplaza cuando entren los Bloques A y B.
 *
 * Espeja uno a uno los `export pure circuit` de `contracts/src/testigo.compact`
 * — mismos nombres, misma aridad, mismo orden de argumentos, mismos tags de
 * domain separation. Cuando el Bloque B exponga el TS generado por el
 * compilador, se reemplazan los cuerpos de las cuatro funciones de abajo y no
 * se toca ninguna vista.
 *
 * Diferencia declarada mientras tanto: acá `H` es SHA-256 y en el circuito es
 * `persistentHash`, así que los valores de hoy NO son los que va a producir la
 * cadena. Lo que sí es real y va a seguir siéndolo después de integrar es el
 * hash de la evidencia (`hashDeArchivo`): ese se calcula del lado de la app en
 * las dos implementaciones, y es el que sostiene la afirmación de que el
 * archivo nunca sale de tu máquina.
 *
 * `crypto.subtle` exige un secure context. Anda en `localhost`; NO anda si
 * servís la demo desde una IP de LAN por http.
 */

export type Hex32 = string; // 64 chars hex en minúscula, sin prefijo 0x

const codificador = new TextEncoder();

/** Espeja `pad(32, "…")` de Compact: bytes UTF-8 y ceros a la derecha. */
export function pad32(texto: string): Uint8Array {
  const bytes = codificador.encode(texto);
  if (bytes.length > 32) {
    throw new Error(`"${texto}" no entra en Bytes<32> (${bytes.length} bytes)`);
  }
  const salida = new Uint8Array(32);
  salida.set(bytes);
  return salida;
}

export function aHex(bytes: Uint8Array): Hex32 {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function deHex(hex: Hex32): Uint8Array {
  const limpio = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(limpio) || limpio.length % 2 !== 0) {
    throw new Error(`hex inválido: ${hex}`);
  }
  const bytes = new Uint8Array(limpio.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(limpio.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return new Uint8Array(digest);
}

/**
 * Sustituto de `persistentHash<Vector<N, Bytes<32>>>`: concatena N valores de
 * 32 bytes y hashea. Conserva la aridad y el orden del circuito, que es lo que
 * importa para que el swap sea mecánico.
 */
async function hashVector(...partes: Uint8Array[]): Promise<Hex32> {
  const total = new Uint8Array(partes.length * 32);
  partes.forEach((parte, i) => {
    if (parte.length !== 32) {
      throw new Error(`la parte ${i} mide ${parte.length} bytes, se esperaban 32`);
    }
    total.set(parte, i * 32);
  });
  return aHex(await sha256(total));
}

// ── Tags de dominio ───────────────────────────────────────────────────────
// Sin esto, `nullifier` y `authorship` comparten forma y un atacante que
// registra una org con orgId = reportId fuerza una colisión cruzada.
const domCred = () => pad32("phantomtrace:cred:v1");
const domReport = () => pad32("phantomtrace:report:v1");
const domNullifier = () => pad32("phantomtrace:nullifier:v1");
const domAuthorship = () => pad32("phantomtrace:authorship:v1");

// ── Los cuatro pure circuits ──────────────────────────────────────────────

/** `leafOf(orgId, credSecret)` — la hoja del árbol de credenciales. */
export function leafOf(orgId: Hex32, credSecret: Hex32): Promise<Hex32> {
  return hashVector(domCred(), deHex(orgId), deHex(credSecret));
}

/** `reportIdOf(ev, sec)` — el sellado. Sólo el autor conoce el preimagen. */
export function reportIdOf(evidenceHash: Hex32, personalSecret: Hex32): Promise<Hex32> {
  return hashVector(domReport(), deHex(evidenceHash), deHex(personalSecret));
}

/**
 * `nullifierOf(sec, orgId, period)` — anti-spam.
 *
 * OJO: en `report()` el circuito lo llama con `cred` (el secret de la
 * credencial), NO con el personal. Una credencial = una denuncia por período.
 */
export function nullifierOf(credSecret: Hex32, orgId: Hex32, period: Hex32): Promise<Hex32> {
  return hashVector(domNullifier(), deHex(credSecret), deHex(orgId), deHex(period));
}

/** `authorshipOf(sec, reportId, prosecutorPk)` — el designated verifier. */
export function authorshipOf(
  personalSecret: Hex32,
  reportId: Hex32,
  prosecutorPk: Hex32,
): Promise<Hex32> {
  return hashVector(domAuthorship(), deHex(personalSecret), deHex(reportId), deHex(prosecutorPk));
}

// ── Utilidades del lado de la app (no son circuitos) ──────────────────────

/**
 * Hashea el archivo de evidencia. Esto corre en tu máquina y el contenido no
 * se transmite a ningún lado — ni al proof server, que sólo recibe el hash.
 * Sigue siendo SHA-256 después de integrar A y B.
 */
export async function hashDeArchivo(contenido: Uint8Array): Promise<Hex32> {
  return aHex(await sha256(contenido));
}

/** `periodo` viaja al circuito como `Bytes<32>`; "2026-08" se paddea. */
export function periodoABytes32(periodo: string): Hex32 {
  return aHex(pad32(periodo));
}

/** Deriva un identificador estable de 32 bytes a partir de una etiqueta. */
export async function idDesdeEtiqueta(etiqueta: string): Promise<Hex32> {
  return aHex(await sha256(codificador.encode(etiqueta)));
}

/** Secret nuevo, aleatorio, que nunca sale de esta máquina. */
export function secretNuevo(): Hex32 {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return aHex(bytes);
}
