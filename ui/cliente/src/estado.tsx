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
import { ANCLA, MUESTRA_ORIGINAL, ORG_ID, ORG_NOMBRE, VERIFICADORES } from "@shared/demo";
import { epochLabel, horaLog } from "@shared/formato";
import { crearAlmacen } from "@shared/almacenamiento";
import { ClienteMock, ledgerVacio, type LedgerLocal } from "@shared/servicio/ClienteMock";
import {
  type ClientePreview,
  type LaceSession,
  conectarLace,
  conectarClientePreview,
} from "@shared/servicio/ClientePreview";
import type { ExportLlaveAutoria, TestigoClient } from "@shared/tipos";

import { DIRECTORIO, EMPLEADO_DEMO, SECRET_PERSONAL_DEMO } from "./demoPrivado";

export type Ruta = "denunciar" | "revelar" | "emitir";
export type Fase = "idle" | "probando" | "listo";

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

  const [ruta, setRuta] = useState<Ruta>("denunciar");
  const [logs, setLogs] = useState<Log[]>(LOGS_INICIALES);
  const [terminalAbierta, setTerminalAbierta] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [identidad, setIdentidad] = useState<Identidad>(() =>
    almacen.leer<Identidad>("identidad", identidadDemo()),
  );

  const [orgRegistrada, setOrgRegistrada] = useState(false);
  const [alturaOrg, setAlturaOrg] = useState<number | null>(null);
  const [hojasEmitidas, setHojasEmitidas] = useState(0);
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
  const [llave, setLlave] = useState<Omit<ExportLlaveAutoria, "fiscalPk" | "autoriaHash"> | null>(
    null,
  );

  const [verificadorId, setVerificadorId] = useState(VERIFICADORES[0].id);
  const [faseRevelar, setFaseRevelar] = useState<Fase>("idle");
  const [pasosRevelar, setPasosRevelar] = useState<string[]>([]);
  const [autoria, setAutoria] = useState<{ autoriaHash: Hex32; bloque: number } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // ── Preview / Lace detection ────────────────────────────────────────────
  const [modo, setModo] = useState<"mock" | "preview">("mock");
  const [laceSession, setLaceSession] = useState<LaceSession | null>(null);

  // Try to connect to Lace on mount. The mock is always the fallback.
  useEffect(() => {
    let cancelado = false;
    conectarClientePreview().then((cp) => {
      if (cancelado || !cp) return;
      setModo("preview");
      // The Lace session is stored for reference but ClientePreview
      // is the TestigoClient that wraps it.
    }).catch(() => {
      // Lace not available — stay in mock mode silently.
    });
    // Also check Lace presence for the header indicator.
    conectarLace().then((s) => {
      if (cancelado || !s) return;
      setLaceSession(s);
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

  // Rehidrata lo que ya estaba en el ledger local de una sesión anterior.
  useEffect(() => {
    const l = cliente.instantanea();
    setOrgRegistrada(ORG_ID in l.organizaciones);
    setAlturaOrg(ORG_ID in l.organizaciones ? l.altura : null);
    setHojasEmitidas(l.credenciales.length);
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
        version: 1,
        denunciaId: r.denunciaId,
        evidenciaHash: cliente.obtenerWitnesses()?.evidenciaHash ?? "",
        secret: identidad.secretPersonal,
      });
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
    const blob = new Blob([JSON.stringify(llave, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "phantom-trace-autoria.key";
    a.click();
    URL.revokeObjectURL(url);
    setLlaveGuardada(true);
    log("phantom-trace-autoria.key escrita en disco · secret + evidenciaHash");
  }, [llave, log]);

  const cargarLlave = useCallback(
    async (f: File) => {
      setError(null);
      try {
        const datos = JSON.parse(await f.text()) as ExportLlaveAutoria;
        if (datos.version !== 1 || !datos.denunciaId || !datos.secret || !datos.evidenciaHash) {
          throw new Error("el archivo no es una llave de autoría válida");
        }
        setLlave({
          version: 1,
          denunciaId: datos.denunciaId,
          evidenciaHash: datos.evidenciaHash,
          secret: datos.secret,
        });
        setIdentidad((previa) => ({ ...previa, secretPersonal: datos.secret }));
        cliente.establecerWitnesses({
          secretPersonal: datos.secret,
          credencialSecret: identidad.credencialSecret,
          orgId: ORG_ID,
          hojaIndex: 0,
          evidenciaHash: datos.evidenciaHash,
        });
        setFaseRevelar("idle");
        setAutoria(null);
        log("phantom-trace-autoria.key leída · witnesses restaurados en memoria local");
      } catch (e) {
        fallar(e);
      }
    },
    [cliente, fallar, identidad.credencialSecret, log],
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

  /** El puente con el Explorer: el material viaja por fuera de la cadena. */
  const material = useMemo<ExportLlaveAutoria | null>(() => {
    if (!llave || !autoria) return null;
    return { ...llave, fiscalPk: verificador.pk, autoriaHash: autoria.autoriaHash };
  }, [autoria, llave, verificador.pk]);

  const copiarMaterial = useCallback(async () => {
    if (!material) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(material, null, 2));
      setCopiado(true);
      log("material exportado al portapapeles · denunciaId + secret + fiscalPk + autoriaHash");
    } catch {
      setError("el browser bloqueó el portapapeles — copiá el JSON a mano");
    }
  }, [log, material]);

  // ── Modo demo ────────────────────────────────────────────────────────────
  //
  // Cada botón deja la app parada en un tiempo del guión, encadenando lo que
  // falte. Existen para que grabar el video no obligue a rehacer los cuatro
  // tiempos en cada toma — y porque a las 12:30 del sábado nadie quiere estar
  // buscando un PDF en un file picker.

  const demoT1 = useCallback(async () => {
    setRuta("emitir");
    if (cliente.instantanea().credenciales.length === 0) await registrarOrg();
  }, [cliente, registrarOrg]);

  const demoT2 = useCallback(async () => {
    setRuta("denunciar");
    if (cliente.instantanea().credenciales.length === 0) await registrarOrg();
    if (!evidencia.current) {
      await cargarMuestra(MUESTRA_ORIGINAL.ruta, MUESTRA_ORIGINAL.nombre);
    }
  }, [cargarMuestra, cliente, registrarOrg]);

  const demoT4 = useCallback(async () => {
    setRuta("revelar");
    if (llave) return;
    if (cliente.instantanea().credenciales.length === 0) await registrarOrg();
    if (!evidencia.current) {
      await cargarMuestra(MUESTRA_ORIGINAL.ruta, MUESTRA_ORIGINAL.nombre);
    }
    await denunciar();
  }, [cargarMuestra, cliente, denunciar, llave, registrarOrg]);

  const reiniciar = useCallback(() => {
    almacen.vaciar();
    cliente.reemplazarLedger(ledgerVacio());
    evidencia.current = null;
    setRuta("denunciar");
    setIdentidad(identidadDemo());
    setOrgRegistrada(false);
    setAlturaOrg(null);
    setHojasEmitidas(0);
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
  }, [cliente]);

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

  return {
    ruta,
    setRuta,
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

    demoT1,
    demoT2,
    demoT4,
    reiniciar,
    nuevaIdentidad,
    modo,
    laceSession,
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
