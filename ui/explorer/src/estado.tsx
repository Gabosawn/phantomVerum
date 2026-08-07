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
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { hashDeArchivo, reportIdOf, type Hex32 } from "@shared/cripto";
import { ORG_ID, ORG_NOMBRE, PERIODO, PK_ACME_LEGAL, VERIFICADORES } from "@shared/demo";
import { ClienteMock, ledgerVacio } from "@shared/servicio/ClienteMock";
import type { ExportLlaveAutoria, TestigoClient } from "@shared/tipos";

import { ALTURA_ACTUAL, AUTORIAS, DENUNCIAS } from "./ledgerFixture";

export type Ruta = "ledger" | "sello" | "autoria";
export type Veredicto = "ok" | "fail" | null;

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
  const faltantes = (["denunciaId", "evidenciaHash", "secret", "autoriaHash"] as const).filter(
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
   * Sembrado con lo que el indexer ya conoce. Cuando entre el Bloque B esto se
   * reemplaza por `ClienteReal` leyendo el GraphQL del indexer, con la misma
   * interfaz y sin tocar ninguna vista.
   */
  const cliente = useMemo<TestigoClient>(() => {
    const l = ledgerVacio(ALTURA_ACTUAL);
    l.denuncias = DENUNCIAS.map((d) => d.denunciaId);
    l.nullifiers = DENUNCIAS.map((d) => d.nullifier);
    l.autorias = [...AUTORIAS];
    l.organizaciones = { [ORG_ID]: "" };
    return new ClienteMock({ ritmoMs: 0, ledgerInicial: l });
  }, []);

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
   * Se recomputa `reportIdOf(hash del documento, secret del autor)` y se
   * compara contra lo que hay en la cadena. Es aritmética, no una discusión de
   * credibilidad: si cambió un byte, el hash no da.
   */
  const verificarSello = useCallback(async () => {
    if (!documento || !material) return;
    const recomputado = await reportIdOf(documento.hash, material.secret);
    setSelloRecomputado(recomputado);
    const enCadena = DENUNCIAS.some((d) => d.denunciaId === recomputado);
    setVeredictoSello(recomputado === material.denunciaId && enCadena ? "ok" : "fail");
  }, [documento, material]);

  const clave = CLAVES.find((c) => c.id === claveId) ?? CLAVES[0];

  /**
   * T4 — el remate.
   *
   * Se recomputa el hash de autoría con LA CLAVE DE QUIEN VERIFICA, no con la
   * que viene en el material. Si el denunciante te designó, da; si estás
   * mirando una prueba que interceptaste, no da. Mismo material, misma cadena.
   */
  const verificarAutoria = useCallback(async () => {
    if (!material) return;
    const r = await cliente.verificarAutoria({ ...material, fiscalPk: clave.pk });
    setAutoriaRecomputada(null);
    setVeredictoAutoria(r.ok && r.enLedger ? "ok" : "fail");
  }, [cliente, clave.pk, material]);

  const elegirClave = useCallback((id: (typeof CLAVES)[number]["id"]) => {
    setClaveId(id);
    setVeredictoAutoria(null);
  }, []);

  return {
    ruta,
    setRuta,
    orgNombre: ORG_NOMBRE,
    periodo: PERIODO,
    orgId: ORG_ID,
    altura: ALTURA_ACTUAL,
    denuncias: DENUNCIAS,

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
