/**
 * Estado del Explorer.
 *
 * Todo lo que hay acá es público. No hay witnesses, no hay proof server, no
 * hay secrets: la única información privada que este programa llega a tocar es
 * la que un denunciante decide pegarle en el campo "material recibido", y sale
 * de la memoria cuando cerrás la pestaña.
 *
 * Este archivo no importa NADA de `cliente/`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { crearAlmacen } from "@shared/almacenamiento";
import { hashDeArchivo, reportIdOf, type Hex32 } from "@shared/cripto";
import {
  ORG_ID,
  ORG_NOMBRE,
  PERIODO,
  PK_ACME_LEGAL,
  URL_CLIENTE,
  VERIFICADORES,
} from "@shared/demo";
import { ClienteMock, ledgerVacio } from "@shared/servicio/ClienteMock";
import {
  type PreviewExplorerReader,
  conectarExplorerPreview,
} from "@shared/servicio/ExplorerPreview";
import type { ExportLlaveAutoria, TestigoClient } from "@shared/tipos";

import { ALTURA_ACTUAL, AUTORIAS, DENUNCIAS } from "./ledgerFixture";

export type Ruta = "ledger" | "sello" | "autoria";
/**
 * `null` = todavía no se preguntó. `parcial` = ni confirmado ni desmentido:
 * lo que este build puede decir de una autoría bien formada. Ver
 * `VeredictoAutoria` en `@shared/tipos` — pintarlo de verde sería exactamente
 * el falso positivo que un empleador puede fabricarse solo.
 */
export type Veredicto = "ok" | "fail" | "parcial" | null;

/** The instruction of the moment, same as in the Cliente. */
export type Instruccion = {
  tono: "pulse" | "alerta" | "fin";
  titulo: string;
  detalle: string;
  accion?: { texto: string; hacer: () => void };
};

/**
 * Stores only whether the welcome screen has been seen. None of the material
 * anyone pastes here is persisted: it dies with the tab.
 */
const almacen = crearAlmacen("explorer");

export type DocumentoPresentado = {
  nombre: string;
  tamano: number;
  hash: Hex32;
};

/** Las dos claves entre las que se elige al verificar. */
export const CLAVES = [
  {
    id: "pia",
    nombre: VERIFICADORES[0].nombre,
    pk: VERIFICADORES[0].pk,
    nota: "la clave que eligió el denunciante",
    intruso: false,
  },
  {
    id: "acme",
    nombre: `Departamento Legal de ${ORG_NOMBRE}`,
    pk: PK_ACME_LEGAL,
    nota: "no fue la clave designada",
    intruso: true,
  },
] as const;

function analizarMaterial(texto: string): ExportLlaveAutoria {
  const datos = JSON.parse(texto) as ExportLlaveAutoria;
  if (datos.version !== 2) {
    throw new Error("versión de material no soportada —se esperaba v2");
  }
  const faltantes = (
    ["denunciaId", "evidenciaHash", "autoriaHash", "proof"] as const
  ).filter(
    (k) => typeof datos[k] !== "string" || !/^[0-9a-f]{64}$/.test(datos[k]),
  );
  if (faltantes.length > 0) {
    throw new Error(`al material le faltan campos válidos: ${faltantes.join(", ")}`);
  }
  return datos;
}

function useEstado() {
  const [ruta, setRuta] = useState<Ruta>("ledger");
  const [materialCrudo, setMaterialCrudo] = useState("");
  const [material, setMaterial] = useState<ExportLlaveAutoria | null>(null);
  const [errorMaterial, setErrorMaterial] = useState<string | null>(null);

  const [documento, setDocumento] = useState<DocumentoPresentado | null>(null);
  const [veredictoSello, setVeredictoSello] = useState<Veredicto>(null);
  const [selloRecomputado, setSelloRecomputado] = useState<Hex32 | null>(null);

  const [claveId, setClaveId] = useState<(typeof CLAVES)[number]["id"]>("pia");
  const [veredictoAutoria, setVeredictoAutoria] = useState<Veredicto>(null);
  const [autoriaRecomputada, setAutoriaRecomputada] = useState<Hex32 | null>(null);

  /**
   * "mock" — in-memory fixture (always works, no network).
   * "preview" — real Midnight Preview indexer (needs deployed contract).
   */
  const [modo, setModo] = useState<"mock" | "preview">("mock");

  /**
   * Sembrado con lo que el indexer ya conoce. Cuando entre el Bloque B esto se
   * reemplaza por `ClienteReal` leyendo el GraphQL del indexer, con la misma
   * interfaz y sin tocar ninguna vista.
   */
  const mockCliente = useMemo<TestigoClient>(() => {
    const l = ledgerVacio(ALTURA_ACTUAL);
    l.denuncias = DENUNCIAS.map((d) => d.denunciaId);
    l.nullifiers = DENUNCIAS.map((d) => d.nullifier);
    l.autorias = [...AUTORIAS];
    l.organizaciones = { [ORG_ID]: "" };
    return new ClienteMock({ ritmoMs: 0, ledgerInicial: l });
  }, []);

  const [previewCliente, setPreviewCliente] = useState<PreviewExplorerReader | null>(null);
  const [denunciasPreview, setDenunciasPreview] = useState<typeof DENUNCIAS>(DENUNCIAS);

  // Try to connect to the Preview indexer on mount. If it works, switch to "preview" mode.
  useEffect(() => {
    let cancelado = false;
    conectarExplorerPreview().then(async (reader) => {
      if (cancelado || !reader) return;
      setPreviewCliente(reader);
      setModo("preview");
      try {
        const estado = await reader.leerEstadoLedger();
        if (!cancelado) {
          setDenunciasPreview(
            estado.denuncias.map((d) => ({ denunciaId: d, nullifier: "" as Hex32, bloque: 0 })),
          );
        }
      } catch {
        // Keep fixture data if the indexer read fails.
      }
    }).catch(() => {
      // Preview not available — stay in mock mode silently.
    });
    return () => { cancelado = true; };
  }, []);

  const denuncias = modo === "preview" ? denunciasPreview : DENUNCIAS;

  /** The active client: Preview reader if available, mock otherwise. */
  const cliente: TestigoClient = modo === "preview" && previewCliente
    ? previewCliente
    : mockCliente;

  const pegarMaterial = useCallback((texto: string) => {
    setMaterialCrudo(texto);
    setVeredictoSello(null);
    setVeredictoAutoria(null);
    if (texto.trim() === "") {
      setMaterial(null);
      setErrorMaterial(null);
      return;
    }
    try {
      setMaterial(analizarMaterial(texto));
      setErrorMaterial(null);
    } catch (e) {
      setMaterial(null);
      setErrorMaterial(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const cargarDocumento = useCallback(async (f: File) => {
    const bytes = new Uint8Array(await f.arrayBuffer());
    setDocumento({ nombre: f.name, tamano: f.size, hash: await hashDeArchivo(bytes) });
    setVeredictoSello(null);
  }, []);

  const cargarMuestra = useCallback(
    async (ruta: string, nombre: string) => {
      const resp = await fetch(ruta);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      await cargarDocumento(new File([bytes as BlobPart], nombre, { type: "application/pdf" }));
    },
    [cargarDocumento],
  );

  /**
   * T3 — ¿es ESTE el documento que se selló?
   *
   * El material v2 no incluye el secret. La verificación de integridad
   * compara el hash del archivo presentado con el evidenciaHash del
   * material (que la prueba ZK demostró correcto).
   */
  const verificarSello = useCallback(async () => {
    if (!documento || !material) return;
    const fileHash = documento.hash;
    setSelloRecomputado(fileHash);
    const hashMatch = fileHash === material.evidenciaHash;
    const enCadena = DENUNCIAS.some((d) => d.denunciaId === material.denunciaId);
    setVeredictoSello(hashMatch && enCadena ? "ok" : "fail");
  }, [documento, material]);

  const clave = CLAVES.find((c) => c.id === claveId) ?? CLAVES[0];

  /**
   * T4 — el remate. Verifica la proof ZK contra el ledger.
   *
   * En modo mock: proof == autoriaHash, se verifica contra el ledger local.
   * En producción: la proof se verifica contra la verifier key del circuito
   * `proveAuthorship` via el proof server `/check`.
   *
   * El secret NUNCA está en el material — fue reemplazado por la proof ZK.
   */
  const verificarAutoria = useCallback(async () => {
    if (!material) return;
    // El material va TAL CUAL llegó: la clave de quien verifica se pasa aparte.
    // Pisar `material.fiscalPk` con la propia clave era el bug que hacía que el
    // Departamento Legal verificara igual que la Fiscalía — se auto-designaba.
    const r = await cliente.verificarAutoria(material, clave.pk);
    setAutoriaRecomputada(null);
    // `no-verificable` NO es "ok". El sobre de la Fiscalía cae acá: la denuncia
    // está sellada y la autoría publicada para su clave, pero nada en el
    // material ata las dos cosas al autor mientras la proof ZK no se verifique.
    setVeredictoAutoria(
      r.veredicto === "verificado" ? "ok" : r.veredicto === "refutado" ? "fail" : "parcial",
    );
  }, [cliente, clave.pk, material]);

  const elegirClave = useCallback((id: (typeof CLAVES)[number]["id"]) => {
    setClaveId(id);
    setVeredictoAutoria(null);
  }, []);

  // ── The guide ────────────────────────────────────────────────────────────

  const [bienvenidaVista, setBienvenidaVista] = useState(() =>
    almacen.leer<boolean>("bienvenidaVista", false),
  );
  const cerrarBienvenida = useCallback(() => {
    almacen.escribir("bienvenidaVista", true);
    setBienvenidaVista(true);
  }, []);

  /**
   * The Explorer has no locks: the only gate is the box where the material gets
   * pasted, and it lives inside the views themselves. What it does have is one
   * instruction per screen, so nobody has to guess what to do with a chain
   * explorer that opens empty.
   */
  const instruccion = ((): Instruccion => {
    if (ruta === "ledger")
      return {
        tono: "pulse",
        titulo: "Esto es todo lo que la cadena hace público",
        detalle:
          "Hashes, el período y la organización afectada. Ningún nombre, ningún archivo, ninguna dirección. El paso 5 es verificar que una de esas denuncias es de quien dice ser.",
        accion: { texto: "Ir a verificar autoría →", hacer: () => setRuta("autoria") },
      };

    if (ruta === "sello") {
      if (!material)
        return {
          tono: "alerta",
          titulo: "Pegá abajo el material que te entregó la denunciante",
          detalle:
            "Sin su parte secreta no se puede reproducir lo que está sellado en la cadena — ni vos, ni la empresa, ni nadie. Eso no es una traba de esta pantalla: es lo que hace que el sello sirva.",
          accion: {
            texto: "Abrir el Cliente ↗",
            hacer: () => window.open(URL_CLIENTE, "_blank", "noreferrer"),
          },
        };
      if (!documento)
        return {
          tono: "pulse",
          titulo: "Elegí qué documento presenta la empresa",
          detalle:
            "Probá primero con el original y después con la versión «rev-legal»: cambia un solo byte y el resultado ya no reproduce lo que está en la cadena.",
        };
      if (!veredictoSello)
        return {
          tono: "pulse",
          titulo: "Compará contra la cadena",
          detalle: "Es aritmética, no una discusión de credibilidad.",
          accion: { texto: "Comparar ahora", hacer: () => void verificarSello() },
        };
      return {
        tono: veredictoSello === "ok" ? "fin" : "pulse",
        titulo:
          veredictoSello === "ok"
            ? "El documento es el que se selló"
            : "Este archivo no es el que se selló — y eso es el punto",
        detalle:
          "Cambiá el documento de abajo y volvé a comparar: el veredicto cambia con un solo byte de diferencia.",
      };
    }

    // ruta === "autoria" — step 5
    if (!material)
      return {
        tono: "alerta",
        titulo: "Pegá abajo el material que te entregó la denunciante",
        detalle:
          "Lo copió en el Cliente, en el paso 4, con el botón «Copiar material para el verificador». Va en el primer recuadro de esta pantalla: es el único puente entre las dos aplicaciones.",
        accion: {
          texto: "Abrir el Cliente ↗",
          hacer: () => window.open(URL_CLIENTE, "_blank", "noreferrer"),
        },
      };
    if (!veredictoAutoria)
      return {
        tono: "pulse",
        titulo: "Elegí tu clave y verificá",
        detalle:
          "Empezá por la clave de la Fiscalía, que es a quien la denunciante designó. Después repetí con la del Departamento Legal: mismo material, misma cadena, y no verifica.",
        accion: { texto: "Verificar ahora", hacer: () => void verificarAutoria() },
      };
    if (veredictoAutoria === "ok")
      return {
        tono: "fin",
        titulo: "Autoría probada ante vos, y sólo ante vos",
        detalle:
          "Ahora cambiá a la clave del Departamento Legal y verificá de nuevo: el mismo material no le prueba nada a quien no fue designado. Ese es el corazón de Phantom Trace.",
        accion: {
          texto: "Probar con la otra clave",
          hacer: () => elegirClave(clave.intruso ? "pia" : "acme"),
        },
      };
    return {
      tono: "pulse",
      titulo: "No verifica — y eso es exactamente lo que tiene que pasar",
      detalle:
        "Esta clave no es la que eligió la denunciante. Interceptar el material no alcanza: la autoría quedó atada a una sola clave pública y no es transferible.",
      accion: {
        texto: "Volver a la clave designada",
        hacer: () => elegirClave("pia"),
      },
    };
  })();

  return {
    ruta,
    setRuta,
    paso: 5 as const,
    instruccion,
    bienvenidaVista,
    cerrarBienvenida,
    orgNombre: ORG_NOMBRE,
    periodo: PERIODO,
    orgId: ORG_ID,
    altura: ALTURA_ACTUAL,
    denuncias,
    modo,

    materialCrudo,
    material,
    errorMaterial,
    pegarMaterial,

    documento,
    cargarDocumento,
    cargarMuestra,
    verificarSello,
    veredictoSello,
    selloRecomputado,

    claves: CLAVES,
    clave,
    elegirClave,
    verificarAutoria,
    veredictoAutoria,
    autoriaRecomputada,
  };
}

type Estado = ReturnType<typeof useEstado>;

const Ctx = createContext<Estado | null>(null);

export function ProveedorEstado({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useEstado()}>{children}</Ctx.Provider>;
}

export function useExplorer(): Estado {
  const valor = useContext(Ctx);
  if (!valor) throw new Error("useExplorer fuera del proveedor");
  return valor;
}
