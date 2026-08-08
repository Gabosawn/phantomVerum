/**
 * The demo-mode script: the whole story, unattended, so it can be recorded.
 *
 * Each scene narrates what is happening in plain language and then runs the
 * REAL action — nothing here is faked that the app would not do by hand. The
 * timings are chosen so the narration can be read on screen without pausing
 * the recording.
 */

export type AccionDemo =
  | "emitir"
  | "cargarEvidencia"
  | "denunciar"
  | "guardarLlave"
  | "revelar"
  | "copiarMaterial";

export type EscenaDemo = {
  /** Short label for the progress dots. */
  rotulo: string;
  /** The sentence shown on screen while it runs. */
  narracion: string;
  accion: AccionDemo;
  /** Beat before acting: leaves time to read. */
  antesMs: number;
  /** Beat after, so the result is visible. */
  despuesMs: number;
};

export const GUION: readonly EscenaDemo[] = [
  {
    rotulo: "Credenciales",
    narracion:
      "ACME S.A. publica en la cadena un único número que resume a todos sus empleados. La lista de gente nunca se publica.",
    accion: "emitir",
    antesMs: 3200,
    despuesMs: 2600,
  },
  {
    rotulo: "Evidencia",
    narracion:
      "Una empleada elige el contrato que quiere denunciar. El archivo se queda en su computadora: solo se calcula su huella digital.",
    accion: "cargarEvidencia",
    antesMs: 3400,
    despuesMs: 2400,
  },
  {
    rotulo: "Denuncia",
    narracion:
      "Su proof server local arma la prueba: demuestra que es de adentro sin decir quién es. A la cadena van dos hashes y nada más.",
    accion: "denunciar",
    antesMs: 3000,
    despuesMs: 3000,
  },
  {
    rotulo: "Llave",
    narracion:
      "Guarda su llave de autoría. Sin ese archivo no podría probar nunca más que la denuncia fue suya. (En la demo se omite la descarga real.)",
    accion: "guardarLlave",
    antesMs: 3600,
    despuesMs: 2200,
  },
  {
    rotulo: "Autoría",
    narracion:
      "Meses después decide aparecer ante la Fiscalía — y solo ante ella. La prueba queda atada a esa clave pública: quien la intercepte y verifique con la suya no encuentra el registro.",
    accion: "revelar",
    antesMs: 3800,
    despuesMs: 3000,
  },
  {
    rotulo: "Entrega",
    narracion:
      "Copia el material para la fiscal. Es el único puente entre las dos aplicaciones: no comparten servidor, ni sesión, ni base de datos.",
    accion: "copiarMaterial",
    antesMs: 3200,
    despuesMs: 2000,
  },
] as const;
