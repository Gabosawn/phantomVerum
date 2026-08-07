import type { Hex32 } from "./cripto";

/**
 * Regla del sistema visual: los hashes se muestran siempre partibles y nunca
 * truncados sin elipsis. Mínimo 12 px proyectado.
 */

/** `0x8f3c…a41d` — para tablas y renglones apretados. */
export function corto(hex: Hex32 | null | undefined, lado = 4): string {
  if (!hex) return "—";
  const limpio = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (limpio.length <= lado * 2) return `0x${limpio}`;
  return `0x${limpio.slice(0, lado)}…${limpio.slice(-lado)}`;
}

/** `0x8f3c9d1ea41d02b74c6e…a41d` — para el valor protagonista de una pantalla. */
export function medio(hex: Hex32 | null | undefined): string {
  if (!hex) return "—";
  const limpio = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (limpio.length <= 24) return `0x${limpio}`;
  return `0x${limpio.slice(0, 20)}…${limpio.slice(-4)}`;
}

/** El hex completo, con prefijo. Lo que se copia y lo que se audita. */
export function completo(hex: Hex32 | null | undefined): string {
  if (!hex) return "—";
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}

export function altura(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-AR");
}

export function pesoArchivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function horaLog(fecha: Date): string {
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return [fecha.getHours(), fecha.getMinutes(), fecha.getSeconds()].map(dosDigitos).join(":");
}
