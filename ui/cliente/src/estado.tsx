/**
 * Todo el estado del Cliente. Nada de esto viaja a ningún lado.
 *
 * Las vistas no conocen `ClienteMock` ni llaman a `cripto.ts`: hablan con la
 * interfaz `TestigoClient` y con este hook. Cuando entre el Bloque B se cambia
 * qué implementación se construye acá abajo y no se toca ninguna vista.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  credCommitmentOf,
  epochIndexOf,
  hashDeArchivo,
  leafOf,
  secretNuevo,
  type Hex32,
} from "@shared/cripto";
import {
  ANCLA,
  MUESTRA_ORIGINAL,
  ORG_ID,
  ORG_NOMBRE,
  URL_EXPLORER,
  VERIFICADORES,
} from "@shared/demo";
import { epochLabel, horaLog } from "@shared/formato";
import { crearAlmacen } from "@shared/almacenamiento";
import { ClienteMock, ledgerVacio, type LedgerLocal } from "@shared/servicio/ClienteMock";
import { type WalletSession, conectarWallet } from "@shared/servicio/ClientePreview";
import type { ExportLlaveAutoria, TestigoClient } from "@shared/tipos";

import { DIRECTORIO, EMPLEADO_DEMO, SECRET_PERSONAL_DEMO } from "./demoPrivado";
import { GUION, type AccionDemo } from "./guionDemo";
import { candados, pasoActual, type EstadoRecorrido } from "./recorrido";

export type Ruta = "denunciar" | "revelar" | "emitir";
export type Fase = "idle" | "probando" | "listo";

/** What the "Ahora" panel shows above every view. Exactly one instruction. */
export type Instruccion = {
  tono: "pulse" | "alerta" | "fin";
  titulo: string;
  detalle: string;
  /** The button that does exactly what the title says. */
  accion?: { texto: string; hacer: () => void };
};

export type Archivo = {
  nombre: string;
  tamano: number;
  hash: Hex32;
};

export type Log = { t: string; m: string };

/** Identidad local del denunciante. El corazón de lo privado. */
type Identidad = {
  secretPersonal: Hex32;
  credencialSecret: Hex32;
  esDemo: boolean;
};

const almacen = crearAlmacen("cliente");

const identidadDemo = (): Identidad => ({
  secretPersonal: SECRET_PERSONAL_DEMO,
  credencialSecret: EMPLEADO_DEMO.credencialSecret,
  esDemo: true,
});

const LOGS_INICIALES: Log[] = [
  { t: "02:38:41", m: "proof server escuchando en 0.0.0.0:6300 (container local)" },
  { t: "02:38:41", m: "verifier keys cargadas: registerOrganization, report, revealAuthorship" },
  { t: "02:39:02", m: "wallet sincronizada · viewing key local · tDUST 12.4 (shielded)" },
];

function useEstado() {
  // Shown, never typed: the reporting period is the CURRENT epoch, derived
  // from the clock exactly like `denunciar` derives it — the contract's C0
  // rejects any other value, so there is nothing for the user to choose.
  const currentEpochLabel = useMemo(
    () => epochLabel(epochIndexOf(Math.floor(Date.now() / 1000))),
    [],
  );

  // Starts on step 1. If an earlier session already issued credentials, the
  // rehydration effect moves the route to whichever step applies: nobody should
  // begin by staring at a screen whose main button is dead.
  const [ruta, setRuta] = useState<Ruta>("emitir");
  const [logs, setLogs] = useState<Log[]>(LOGS_INICIALES);
  const [terminalAbierta, setTerminalAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bienvenidaVista, setBienvenidaVista] = useState(() =>
    almacen.leer<boolean>("bienvenidaVista", false),
  );

  const [identidad, setIdentidad] = useState<Identidad>(() =>
    almacen.leer<Identidad>("identidad", identidadDemo()),
  );

  const [orgRegistrada, setOrgRegistrada] = useState(false);
  const [alturaOrg, setAlturaOrg] = useState<number | null>(null);
  const [hojasEmitidas, setHojasEmitidas] = useState(0);
  /**
   * If the local ledger already holds reports, step 4 stays open even when this
   * session signed none: that is precisely the product's story — you come back
   * months later and load your .key file — and without it, unreachable.
   */
  const [hayDenuncias, setHayDenuncias] = useState(false);
  // What the ISSUER sees of each employee: name, role, the COMMITMENT the
  // employee handed over, and the derived leaf. Never the credential secret.
  const [directorioConHojas, setDirectorioConHojas] = useState(
    DIRECTORIO.map((emp) => ({
      nombre: emp.nombre,
      rol: emp.rol,
      credCommitment: "" as Hex32,
      hoja: "" as Hex32,
    })),
  );

  const [archivo, setArchivo] = useState<Archivo | null>(null);
  const evidencia = useRef<Uint8Array | null>(null);

  const [faseDenuncia, setFaseDenuncia] = useState<Fase>("idle");
  const [pasosDenuncia, setPasosDenuncia] = useState<string[]>([]);
  const [denuncia, setDenuncia] = useState<{
    denunciaId: Hex32;
    nullifier: Hex32;
    txId: string;
    bloque: number;
  } | null>(null);

  const [llaveGuardada, setLlaveGuardada] = useState(false);
  const [llave, setLlave] = useState<ExportLlaveAutoria | null>(null);

  const [verificadorId, setVerificadorId] = useState(VERIFICADORES[0].id);
  const [faseRevelar, setFaseRevelar] = useState<Fase>("idle");
  const [pasosRevelar, setPasosRevelar] = useState<string[]>([]);
  const [autoria, setAutoria] = useState<{ autoriaHash: Hex32; bloque: number } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // ── Demo mode ────────────────────────────────────────────────────────────
  const [demoActiva, setDemoActiva] = useState(false);
  const [demoPausada, setDemoPausada] = useState(false);
  const [demoEscena, setDemoEscena] = useState(0);

  // ── Wallet detection ────────────────────────────────────────────────────
  //
  // El Cliente corre SIEMPRE contra `ClienteMock`, y por eso acá no hay ningún
  // `modo`. Había uno: se llamaba a `conectarClientePreview()`, se tiraba el
  // cliente que devolvía y solo se prendía un badge "preview" — de modo que el
  // encabezado podía decir "preview" mientras cada operación seguía corriendo
  // contra el mock. (En la práctica nunca llegaba a prenderse: la llamada iba
  // sin dirección de contrato y `conectarClientePreview` devuelve `null` sin
  // ella, así que el badge era inalcanzable además de mentiroso.)
  //
  // Escribir de verdad contra Preview desde el browser no es cablear esto: es
  // la integración de `callTx` que `ClientePreview.ts` declara pendiente. El
  // Explorer sí lee la cadena real — ver `previewConfig.ts`.
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);

  // Detect the wallet for the header indicator. This one is honest: it says
  // whether a wallet is present, and claims nothing about where the circuits run.
  useEffect(() => {
    let cancelado = false;
    conectarWallet().then((s) => {
      if (cancelado || !s) return;
      setWalletSession(s);
    }).catch(() => {});
    return () => { cancelado = true; };
  }, []);

  const log = useCallback((m: string) => {
    setLogs((previos) => [...previos, { t: horaLog(new Date()), m }]);
  }, []);

  // ── El cliente. Acá se enchufa el Bloque B cuando exista. ────────────────
  const cliente = useMemo<TestigoClient & ClienteMock>(() => {
    const inicial = almacen.leer<LedgerLocal | null>("ledger", null);
    return new ClienteMock({
      ritmoMs: 600,
      ledgerInicial: inicial ?? ledgerVacio(),
      alCambiar: (l) => almacen.escribir("ledger", l),
    });
  }, []);

  // Rehydrates whatever an earlier session left in the local ledger, and parks
  // the app on the first step that is still missing.
  useEffect(() => {
    const l = cliente.instantanea();
    setOrgRegistrada(ORG_ID in l.organizaciones);
    setAlturaOrg(ORG_ID in l.organizaciones ? l.altura : null);
    setHojasEmitidas(l.credenciales.length);
    setHayDenuncias(l.denuncias.length > 0);
    if (l.credenciales.length > 0) setRuta("denunciar");
  }, [cliente]);

  // Las hojas son públicas: son lo que el ancla resume. Se muestran para dejar
  // claro que conocerlas no le sirve a nadie para saber quién denunció.
  // The commitment derivation happens on the EMPLOYEE's side: the issuer only
  // ever receives `credCommitmentOf(credSecret)`, never the secret itself.
  useEffect(() => {
    setDirectorioConHojas(
      DIRECTORIO.map((emp) => {
        const credCommitment = credCommitmentOf(emp.credencialSecret);
        return {
          nombre: emp.nombre,
          rol: emp.rol,
          credCommitment,
          hoja: leafOf(ORG_ID, credCommitment),
        };
      }),
    );
  }, []);

  useEffect(() => {
    almacen.escribir("identidad", identidad);
    cliente.establecerWitnesses({
      secretPersonal: identidad.secretPersonal,
      credencialSecret: identidad.credencialSecret,
      orgId: ORG_ID,
      hojaIndex: 0,
    });
  }, [cliente, identidad]);

  const fallar = useCallback(
    (e: unknown) => {
      const mensaje = e instanceof Error ? e.message : String(e);
      setError(mensaje);
      log(`✗ rechazado en proof time · ${mensaje} · no se emitió transacción`);
    },
    [log],
  );

  // ── T1 ───────────────────────────────────────────────────────────────────

  const registrarOrg = useCallback(async () => {
    setError(null);
    try {
      const tx = await cliente.registrarOrganizacion({ orgId: ORG_ID, ancla: ANCLA });
      setOrgRegistrada(true);
      setAlturaOrg(tx.blockHeight);
      log("circuit registerOrganization(orgId, ancla) · sin witnesses");
      log(`tx confirmada · organizations[0x${ORG_ID.slice(0, 8)}…] ← ancla`);

      // Employee side: each employee derives their commitment locally and
      // hands ONLY that to the issuer. The mock rebuilds the leaf itself.
      for (const empleado of DIRECTORIO) {
        await cliente.emitirCredencial({
          orgId: ORG_ID,
          credCommitment: credCommitmentOf(empleado.credencialSecret),
        });
      }
      setHojasEmitidas(cliente.instantanea().credenciales.length);
      log(`${DIRECTORIO.length} credenciales emitidas · la empresa sólo vio commitments`);
    } catch (e) {
      fallar(e);
    }
  }, [cliente, fallar, log]);

  // ── T2 ───────────────────────────────────────────────────────────────────

  const cargarArchivo = useCallback(
    async (f: File) => {
      setError(null);
      const bytes = new Uint8Array(await f.arrayBuffer());
      const hash = await hashDeArchivo(bytes);
      evidencia.current = bytes;
      setArchivo({ nombre: f.name, tamano: f.size, hash });
      log("archivo leído desde disco · SHA-256 calculado en el cliente");
      log("el contenido del archivo NO se envía a ningún proceso remoto");
    },
    [log],
  );

  const cargarMuestra = useCallback(
    async (ruta: string, nombre: string) => {
      const resp = await fetch(ruta);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      await cargarArchivo(new File([bytes as BlobPart], nombre, { type: "application/pdf" }));
    },
    [cargarArchivo],
  );

  const quitarArchivo = useCallback(() => {
    evidencia.current = null;
    setArchivo(null);
  }, []);

  const denunciar = useCallback(async () => {
    if (!evidencia.current || faseDenuncia !== "idle") return;
    setError(null);
    setFaseDenuncia("probando");
    setPasosDenuncia([]);
    log("POST /prove report · witnesses: credentialSecret, personalSecret, evidenceHash");

    try {
      // The period is DERIVED from the clock, never typed by the user: the
      // contract's C0 rejects anything that is not the current epoch.
      const periodo = epochIndexOf(Math.floor(Date.now() / 1000));
      const r = await cliente.denunciar(
        { orgId: ORG_ID, periodo, evidencia: evidencia.current },
        (paso) => {
          setPasosDenuncia((previos) => [...previos, paso]);
          log(paso);
        },
      );
      setDenuncia({
        denunciaId: r.denunciaId,
        nullifier: r.nullifier,
        txId: r.tx.txId,
        bloque: r.tx.blockHeight,
      });
      setLlave({
        version: 2,
        denunciaId: r.denunciaId,
        evidenciaHash: cliente.obtenerWitnesses()?.evidenciaHash ?? "",
        fiscalPk: "",
        autoriaHash: "",
        proof: "", // filled at reveal time
      });
      setHayDenuncias(true);
      setFaseDenuncia("listo");
    } catch (e) {
      setFaseDenuncia("idle");
      setPasosDenuncia([]);
      fallar(e);
    }
  }, [cliente, faseDenuncia, fallar, identidad.secretPersonal, log]);

  // ── La llave de autoría ──────────────────────────────────────────────────

  const guardarLlave = useCallback(() => {
    if (!llave) return;
    const exportable: ExportLlaveAutoria = {
      version: 2,
      denunciaId: llave.denunciaId,
      evidenciaHash: llave.evidenciaHash,
      fiscalPk: llave.fiscalPk,
      autoriaHash: llave.autoriaHash,
      proof: llave.proof,
    };
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "phantom-trace-autoria.key";
    a.click();
    URL.revokeObjectURL(url);
    setLlaveGuardada(true);
    log("phantom-trace-autoria.key escrita en disco · proof ZK (mock: autoriaHash)");
  }, [llave, log]);

  /**
   * Same as `guardarLlave` but without downloading the file. Demo mode only:
   * during a recording the browser's download shelf covers half the screen and
   * adds nothing the narration does not already say.
   */
  const marcarLlaveGuardada = useCallback(() => {
    setLlaveGuardada(true);
    log("llave de autoría guardada · (demo: se omite la descarga del archivo)");
  }, [log]);

  const cargarLlave = useCallback(
    async (f: File) => {
      setError(null);
      try {
        const datos = JSON.parse(await f.text()) as ExportLlaveAutoria;
        if (datos.version !== 2 || !datos.denunciaId || !datos.evidenciaHash || !datos.proof) {
          throw new Error("el archivo no es una llave de autoría válida (v2)");
        }
        setLlave({
          version: 2,
          denunciaId: datos.denunciaId,
          evidenciaHash: datos.evidenciaHash,
          fiscalPk: "",
          autoriaHash: "",
          proof: datos.proof,
        });
        cliente.establecerWitnesses({
          secretPersonal: identidad.secretPersonal,
          credencialSecret: identidad.credencialSecret,
          orgId: ORG_ID,
          hojaIndex: 0,
          evidenciaHash: datos.evidenciaHash,
        });
        setFaseRevelar("idle");
        setAutoria(null);
        log("phantom-trace-autoria.key leída · proof ZK cargada, sin secret");
      } catch (e) {
        fallar(e);
      }
    },
    [cliente, fallar, identidad.credencialSecret, identidad.secretPersonal, log],
  );

  // ── T4 ───────────────────────────────────────────────────────────────────

  const verificador = VERIFICADORES.find((v) => v.id === verificadorId) ?? VERIFICADORES[0];

  const revelar = useCallback(async () => {
    if (!llave || faseRevelar !== "idle") return;
    setError(null);
    setFaseRevelar("probando");
    setPasosRevelar([]);
    log(`POST /prove revealAuthorship · fiscalPk 0x${verificador.pk.slice(0, 6)}…`);

    try {
      const r = await cliente.revelarAutoria(
        { denunciaId: llave.denunciaId, fiscalPk: verificador.pk },
        (paso) => {
          setPasosRevelar((previos) => [...previos, paso]);
          log(paso);
        },
      );
      setAutoria({ autoriaHash: r.autoriaHash, bloque: r.tx.blockHeight });
      setFaseRevelar("listo");
      setCopiado(false);
    } catch (e) {
      setFaseRevelar("idle");
      setPasosRevelar([]);
      fallar(e);
    }
  }, [cliente, faseRevelar, fallar, llave, log, verificador.pk]);

  /** El puente con el Explorer: proof ZK, sin secret. */
  const material = useMemo<ExportLlaveAutoria | null>(() => {
    if (!llave || !autoria) return null;
    return {
      version: 2,
      denunciaId: llave.denunciaId,
      evidenciaHash: llave.evidenciaHash,
      fiscalPk: verificador.pk,
      autoriaHash: autoria.autoriaHash,
      proof: autoria.autoriaHash, // mock: proof == autoriaHash; producción: proof ZK real
    };
  }, [autoria, llave, verificador.pk]);

  const copiarMaterial = useCallback(async () => {
    if (!material) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(material, null, 2));
      setCopiado(true);
      log("material exportado · proof ZK (sin secret) + denunciaId + fiscalPk");
    } catch {
      setError("el browser bloqueó el portapapeles — copiá el JSON a mano");
    }
  }, [log, material]);

  const reiniciar = useCallback(() => {
    almacen.vaciar();
    // `vaciar` wipes the whole namespace, including the "welcome already seen"
    // flag. Restarting the walkthrough is not the same as never having seen the
    // app: without this, demo mode — which resets — would bring the entry card
    // back on the next reload, mid-recording.
    if (bienvenidaVista) almacen.escribir("bienvenidaVista", true);
    cliente.reemplazarLedger(ledgerVacio());
    evidencia.current = null;
    setRuta("emitir");
    setIdentidad(identidadDemo());
    setOrgRegistrada(false);
    setAlturaOrg(null);
    setHojasEmitidas(0);
    setHayDenuncias(false);
    setArchivo(null);
    setFaseDenuncia("idle");
    setPasosDenuncia([]);
    setDenuncia(null);
    setLlaveGuardada(false);
    setLlave(null);
    setVerificadorId(VERIFICADORES[0].id);
    setFaseRevelar("idle");
    setPasosRevelar([]);
    setAutoria(null);
    setCopiado(false);
    setError(null);
    setLogs([...LOGS_INICIALES, { t: horaLog(new Date()), m: "estado local borrado" }]);
  }, [bienvenidaVista, cliente]);

  /**
   * Genera una identidad nueva. El Explorer NO va a reconocer las denuncias
   * que salgan de acá, y eso está bien: sólo tiene indexada la de la demo.
   */
  const nuevaIdentidad = useCallback(() => {
    setIdentidad({
      secretPersonal: secretNuevo(),
      credencialSecret: EMPLEADO_DEMO.credencialSecret,
      esDemo: false,
    });
    setArchivo(null);
    evidencia.current = null;
    setFaseDenuncia("idle");
    setDenuncia(null);
    setLlave(null);
    setLlaveGuardada(false);
    setFaseRevelar("idle");
    setAutoria(null);
    log("secret personal rotado · esta identidad no está en el índice de la demo");
  }, [log]);

  // ── The guide ────────────────────────────────────────────────────────────

  const recorrido: EstadoRecorrido = {
    hojasEmitidas,
    hayDenuncias,
    tieneLlave: Boolean(llave),
    llaveGuardada,
    faseDenuncia,
    faseRevelar,
  };

  /** Which screens are locked, and why. See `recorrido.ts`. */
  const bloqueos = candados(recorrido);

  /** The single navigation gate. If the step is locked, nothing moves. */
  const irA = useCallback(
    (destino: Ruta) => {
      if (bloqueos[destino]) return;
      setError(null);
      setRuta(destino);
    },
    // The two reasons are the whole real dependency: `bloqueos.emitir` is
    // always null. The callback is rebuilt exactly when a lock changes, so it
    // never decides using a stale one.
    [bloqueos.denunciar, bloqueos.revelar],
  );

  /** Which of the five steps the story stands on. See `recorrido.ts`. */
  const paso = pasoActual(recorrido);

  /**
   * The one instruction on display: the one that applies to THIS screen at THIS
   * moment. When the screen is not the current step's, it says so and offers
   * the shortcut — previously a dead button with a hidden `title` was the whole
   * explanation on offer.
   */
  const instruccion = ((): Instruccion => {
    if (ruta === "emitir") {
      if (!orgRegistrada)
        return {
          tono: "pulse",
          titulo: "Publicá el ancla de ACME",
          detalle:
            "Es lo único que la empresa manda a la cadena: un número que resume a sus seis empleados. La lista de nombres no se publica nunca.",
          accion: { texto: "Publicar ahora", hacer: () => void registrarOrg() },
        };
      return {
        tono: "fin",
        titulo: "Las credenciales ya están emitidas",
        detalle:
          "Paso 1 terminado. Ahora la empleada puede probar que trabaja acá sin decir cuál de los seis es.",
        accion: { texto: "Ir al paso 2 →", hacer: () => irA("denunciar") },
      };
    }

    if (ruta === "denunciar") {
      if (hojasEmitidas === 0)
        return {
          tono: "alerta",
          titulo: "Primero la empresa tiene que emitir las credenciales",
          detalle:
            "Sin credenciales no hay nada que probar, y el botón de firmar de abajo va a seguir apagado. Es el paso 1 y toma un click.",
          accion: { texto: "Ir al paso 1", hacer: () => irA("emitir") },
        };
      if (!archivo)
        return {
          tono: "pulse",
          titulo: "Elegí el archivo que querés denunciar",
          detalle:
            "Arrastralo al recuadro de abajo o usá el expediente de muestra. El archivo no se sube a ningún lado: acá sólo se calcula su huella digital.",
          accion: {
            texto: "Usar el expediente de muestra",
            hacer: () => void cargarMuestra(MUESTRA_ORIGINAL.ruta, MUESTRA_ORIGINAL.nombre),
          },
        };
      if (faseDenuncia === "probando")
        return {
          tono: "pulse",
          titulo: "Generando la prueba en tu máquina…",
          detalle:
            "El proof server local está armando la prueba criptográfica. Nada de esto sale de tu computadora.",
        };
      if (faseDenuncia === "idle")
        return {
          tono: "pulse",
          titulo: "Firmá la denuncia",
          detalle:
            "De acá salen exactamente dos números: la huella de la evidencia mezclada con tu secreto, y un anti-spam que no se puede vincular con vos.",
          accion: { texto: "Sellar y denunciar", hacer: () => void denunciar() },
        };
      if (!llaveGuardada)
        return {
          tono: "alerta",
          titulo: "Descargá tu llave de autoría antes de seguir",
          detalle:
            "Es lo único de todo el sistema que no se puede recuperar. Sin ese archivo la denuncia sigue en pie, pero no vas a poder probar nunca más que fue tuya.",
          accion: { texto: "Descargar la llave", hacer: guardarLlave },
        };
      return {
        tono: "fin",
        titulo: "Denuncia sellada y llave guardada",
        detalle: "Pasaron meses. Ahora decidís aparecer ante una autoridad — y sólo ante ella.",
        accion: { texto: "Ir al paso 4 →", hacer: () => irA("revelar") },
      };
    }

    // ruta === "revelar"
    if (!llave)
      return {
        tono: "alerta",
        titulo: "Necesitás tu llave de autoría",
        detalle:
          "Cargá abajo el archivo phantom-trace-autoria.key que descargaste al denunciar. Si todavía no denunciaste, ese es el paso 2.",
        accion: { texto: "Ir al paso 2", hacer: () => irA("denunciar") },
      };
    if (faseRevelar === "probando")
      return {
        tono: "pulse",
        titulo: "Generando la prueba de autoría…",
        detalle: "Se está atando la prueba a la clave pública de quien elegiste.",
      };
    if (faseRevelar === "idle")
      return {
        tono: "pulse",
        titulo: "Elegí ante quién querés aparecer y firmá",
        detalle:
          "La prueba queda atada a la clave de esa persona: quien la intercepte y verifique con la suya no encuentra el registro. Entregada, sí es reenviable.",
        accion: { texto: "Generar prueba de autoría", hacer: () => void revelar() },
      };
    if (!copiado)
      return {
        tono: "pulse",
        titulo: "Copiá el material para el verificador",
        detalle:
          "Es el único puente entre las dos aplicaciones: no comparten servidor, ni sesión, ni base de datos. Sólo el portapapeles.",
        accion: { texto: "Copiar material", hacer: () => void copiarMaterial() },
      };
    return {
      tono: "fin",
      titulo: "Último paso, en la otra aplicación",
      detalle:
        "Abrí el Explorer, entrá en «Verificar autoría» y pegá el material en el primer recuadro. Probá también con la otra clave: no verifica.",
      accion: {
        texto: "Abrir el Explorer ↗",
        hacer: () => window.open(URL_EXPLORER, "_blank", "noreferrer"),
      },
    };
  })();

  // ── The demo player ──────────────────────────────────────────────────────
  //
  // Runs the whole story unattended, to record it in one take. It simulates
  // nothing: it calls the SAME functions the buttons call, with beats between
  // scenes so the narration can be read without pausing the recording.

  /**
   * The actions, always in their latest version. The player lives inside one
   * long `async`: were it to capture a single render's callbacks, by scene 4 it
   * would be calling a `revelar()` that does not yet know about the key scene 3
   * created.
   */
  const accionesRef = useRef({
    registrarOrg,
    cargarMuestra,
    denunciar,
    marcarLlaveGuardada,
    revelar,
    copiarMaterial,
    reiniciar,
    setRuta,
  });
  useEffect(() => {
    accionesRef.current = {
      registrarOrg,
      cargarMuestra,
      denunciar,
      marcarLlaveGuardada,
      revelar,
      copiarMaterial,
      reiniciar,
      setRuta,
    };
  });

  const mando = useRef({ pausada: false, cancelada: false, saltar: false });

  /** A beat that respects pause / skip / exit. */
  const compas = useCallback(async (ms: number) => {
    const hasta = Date.now() + ms;
    for (;;) {
      if (mando.current.cancelada) throw new Error("demo:cancelada");
      if (mando.current.saltar) {
        mando.current.saltar = false;
        return;
      }
      if (!mando.current.pausada && Date.now() >= hasta) return;
      await new Promise((listo) => setTimeout(listo, 80));
    }
  }, []);

  const ejecutarEscena = useCallback(async (accion: AccionDemo) => {
    const a = accionesRef.current;
    switch (accion) {
      case "emitir":
        a.setRuta("emitir");
        await a.registrarOrg();
        return;
      case "cargarEvidencia":
        a.setRuta("denunciar");
        await a.cargarMuestra(MUESTRA_ORIGINAL.ruta, MUESTRA_ORIGINAL.nombre);
        return;
      case "denunciar":
        await a.denunciar();
        return;
      case "guardarLlave":
        a.marcarLlaveGuardada();
        return;
      case "revelar":
        a.setRuta("revelar");
        await a.revelar();
        return;
      case "copiarMaterial":
        await a.copiarMaterial();
        return;
    }
  }, []);

  const reproducirDemo = useCallback(async () => {
    mando.current = { pausada: false, cancelada: false, saltar: false };
    setDemoPausada(false);
    setDemoActiva(true);
    setDemoEscena(0);
    accionesRef.current.reiniciar();
    // One tick so the reset lands before the first scene.
    await new Promise((listo) => setTimeout(listo, 80));

    try {
      for (let i = 0; i < GUION.length; i++) {
        setDemoEscena(i);
        await compas(GUION[i].antesMs);
        await ejecutarEscena(GUION[i].accion);
        await compas(GUION[i].despuesMs);
      }
      setDemoEscena(GUION.length); // the closing card
    } catch {
      // Deliberate exit: `salirDemo` already left the app in a consistent state.
    }
  }, [compas, ejecutarEscena]);

  const pausarDemo = useCallback(() => {
    mando.current.pausada = !mando.current.pausada;
    setDemoPausada(mando.current.pausada);
  }, []);

  const saltarEscena = useCallback(() => {
    mando.current.saltar = true;
  }, []);

  const salirDemo = useCallback(() => {
    mando.current.cancelada = true;
    mando.current.pausada = false;
    setDemoActiva(false);
    setDemoPausada(false);
  }, []);

  const cerrarBienvenida = useCallback(() => {
    almacen.escribir("bienvenidaVista", true);
    setBienvenidaVista(true);
  }, []);

  return {
    ruta,
    irA,
    bloqueos,
    paso,
    instruccion,
    bienvenidaVista,
    cerrarBienvenida,
    logs: logs.slice(-5),
    terminalAbierta,
    setTerminalAbierta,
    error,
    limpiarError: () => setError(null),

    orgNombre: ORG_NOMBRE,
    periodo: currentEpochLabel,
    orgId: ORG_ID,
    ancla: ANCLA,
    directorio: DIRECTORIO,
    directorioConHojas,
    identidad,

    orgRegistrada,
    alturaOrg,
    hojasEmitidas,
    registrarOrg,

    archivo,
    cargarArchivo,
    cargarMuestra,
    quitarArchivo,
    faseDenuncia,
    pasosDenuncia,
    denuncia,
    denunciar,

    llave,
    llaveGuardada,
    guardarLlave,
    cargarLlave,

    verificadores: VERIFICADORES,
    verificador,
    setVerificadorId,
    faseRevelar,
    pasosRevelar,
    autoria,
    revelar,
    material,
    copiado,
    copiarMaterial,

    demoActiva,
    demoPausada,
    demoEscena,
    guion: GUION,
    reproducirDemo,
    pausarDemo,
    saltarEscena,
    salirDemo,

    reiniciar,
    nuevaIdentidad,
    walletSession,
  };
}

type Estado = ReturnType<typeof useEstado>;

const Ctx = createContext<Estado | null>(null);

export function ProveedorEstado({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useEstado()}>{children}</Ctx.Provider>;
}

export function useCliente(): Estado {
  const valor = useContext(Ctx);
  if (!valor) throw new Error("useCliente fuera del proveedor");
  return valor;
}
