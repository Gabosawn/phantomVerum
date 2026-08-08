/**
 * The demo's script, in plain Spanish and in a single place.
 *
 * Both apps render THIS same five-step list, so whoever is looking at the
 * screen always knows where they stand and what is left — even when the next
 * step lives in the other application, in the other browser tab.
 *
 * Imports nothing from `cliente/` or `explorer/`: this is the shared
 * vocabulary, not the state. Each app derives its own current step.
 *
 * The user-facing strings stay in Spanish: they are the product's copy.
 */

export type NumeroPaso = 1 | 2 | 3 | 4 | 5;
export type AppGuia = "cliente" | "explorer";

export type PasoGuia = {
  n: NumeroPaso;
  /** Which app performs it. Steps from the other app render dimmed. */
  app: AppGuia;
  /** Tab name inside its own app. */
  ruta: string;
  /** How the step is named in the bar. No jargon. */
  titulo: string;
  /** Who performs it, in the narrative. */
  quien: string;
};

export const PASOS: readonly PasoGuia[] = [
  {
    n: 1,
    app: "cliente",
    ruta: "emitir",
    titulo: "La empresa reparte credenciales",
    quien: "ACME S.A.",
  },
  {
    n: 2,
    app: "cliente",
    ruta: "denunciar",
    titulo: "La empleada denuncia",
    quien: "la denunciante",
  },
  {
    n: 3,
    app: "cliente",
    ruta: "denunciar",
    titulo: "Guarda su llave",
    quien: "la denunciante",
  },
  {
    n: 4,
    app: "cliente",
    ruta: "revelar",
    titulo: "Revela quién fue",
    quien: "la denunciante",
  },
  {
    n: 5,
    app: "explorer",
    ruta: "autoria",
    titulo: "La fiscal lo verifica",
    quien: "la fiscal",
  },
] as const;

/** Protocol jargon translated to plain language. Consumed by `<Termino>`. */
export const GLOSARIO: Record<string, string> = {
  ancla:
    "Un único número que resume a TODOS los empleados de la empresa. Es lo único que se publica: de ahí no se puede sacar la lista de gente.",
  credencial:
    "La prueba de que trabajás en la empresa. Vive en tu computadora; la empresa nunca ve su parte secreta.",
  nullifier:
    "Un número que sirve para impedir que la misma persona denuncie mil veces en el mismo período — sin decir quién es. No se puede vincular con su credencial.",
  denunciaId:
    "La huella digital de la evidencia, mezclada con tu secreto. Es lo que queda sellado en la cadena. De ahí no se puede recuperar el archivo.",
  witness:
    "Los datos privados que entran a la prueba criptográfica y NO salen de tu máquina: tu secreto, el archivo, tu credencial.",
  "proof server":
    "El programa que arma la prueba criptográfica. Corre en tu propia computadora, en el puerto 6300: por eso los datos privados no viajan.",
  ledger: "El registro público de la cadena. Cualquiera lo puede leer; no tiene nada privado adentro.",
  epoch:
    "El período de tiempo de la denuncia, en bloques gruesos a propósito: si fuera al segundo, se podría adivinar quién denunció mirando el reloj.",
  "llave de autoría":
    "Un archivo chico que guardás vos. Sin él no podés probar nunca más que la denuncia fue tuya. Es lo único irrecuperable de todo el sistema.",
  hash: "Una huella digital de un archivo: cambia un solo byte y da un número completamente distinto. No se puede volver del número al archivo.",
  "designated verifier":
    "La autoría se publica una vez por cada destinatario: el registro que queda en la cadena para la Fiscalía es un valor distinto del que quedaría para cualquier otro, así que quien verifique con otra clave no lo encuentra. Lo que NO hace: volverla intransferible. La prueba es públicamente verificable, así que una vez entregada, quien la recibe puede reenviarla y el que sigue la verifica igual.",
};
