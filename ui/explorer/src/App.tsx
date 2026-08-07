import { BotonTema, Cabecera, DatoHeader, Pestana } from "@shared/componentes/Cabecera";
import { MONO, Rotulo, SG } from "@shared/componentes/base";
import { URL_CLIENTE } from "@shared/demo";
import { altura } from "@shared/formato";
import { useTema } from "@shared/useTema";

import { useExplorer } from "./estado";
import { Autoria } from "./vistas/Autoria";
import { Ledger } from "./vistas/Ledger";
import { Sello } from "./vistas/Sello";

export function App() {
  const e = useExplorer();
  const tema = useTema("explorer", "oscuro");

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
        background: "var(--pv-surface)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Cabecera
        etiqueta={["Explorer", "público"]}
        pestanas={
          <>
            <Pestana
              titulo="Ledger"
              sub="public state"
              subColor="var(--pv-dim)"
              activa={e.ruta === "ledger"}
              onClick={() => e.setRuta("ledger")}
            />
            <Pestana
              titulo="Verificar sello"
              sub="t3 · integrity"
              subColor="var(--pv-dim)"
              activa={e.ruta === "sello"}
              onClick={() => e.setRuta("sello")}
            />
            <Pestana
              titulo="Verificar autoría"
              sub="t4 · verifier"
              subColor="var(--pv-accent)"
              activa={e.ruta === "autoria"}
              onClick={() => e.setRuta("autoria")}
            />
          </>
        }
      >
        <DatoHeader titulo="block" color="var(--pv-text2)">
          <span style={{ color: "var(--pv-dim)" }}>{altura(e.altura)}</span>
        </DatoHeader>
        <DatoHeader titulo="indexer" color="var(--pv-text2)">
          {e.modo === "preview" ? (
            <span style={{ color: "var(--pv-pos)" }}>✓ preview</span>
          ) : (
            <span style={{ color: "var(--pv-dim)" }}>mock</span>
          )}
        </DatoHeader>
        <a
          href={URL_CLIENTE}
          target="_blank"
          rel="noreferrer"
          style={{ font: `500 10px/1.35 ${MONO}`, letterSpacing: ".05em" }}
        >
          Cliente
          <br />
          local ↗
        </a>
        <BotonTema etiqueta={tema.etiqueta} onClick={tema.alternar} />
      </Cabecera>

      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div style={{ position: "absolute", inset: 0, overflow: "auto" }}>
          <main
            style={{
              boxSizing: "border-box",
              width: "100%",
              maxWidth: 980,
              margin: "0 auto",
              padding: "40px 44px 40px",
              display: "flex",
              flexDirection: "column",
              gap: 26,
            }}
          >
            {e.ruta === "ledger" && <Ledger />}
            {e.ruta === "sello" && <Sello />}
            {e.ruta === "autoria" && <Autoria />}
          </main>
        </div>
      </div>

      {/*
        El contrapunto del terminal del Cliente. Que este pie diga "sin proof
        server" y no tenga logs NO es una omisión: es la afirmación de que este
        programa no recibe nada privado.
      */}
      <div
        style={{
          background: "var(--pv-sunken)",
          borderTop: "1.5px solid var(--pv-h25)",
          padding: "11px 22px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          flex: "none",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: e.modo === "preview" ? "var(--pv-pos)" : "var(--pv-dim)",
            flex: "none",
          }}
        />
        <Rotulo color="var(--pv-text2)" tracking=".12em">
          {e.modo === "preview" ? "indexer · preview" : "sin proof server · mock"}
        </Rotulo>
        <span style={{ font: `400 12.5px/1.4 ${SG}`, color: "var(--pv-muted)" }}>
          {e.modo === "preview"
            ? "Leyendo directamente del indexer de Midnight Preview. Datos reales on-chain."
            : (
              <>
                Este explorador no genera pruebas ni recibe witnesses — sólo lee la cadena. Todo lo
                privado vive en el{" "}
                <a href={URL_CLIENTE} target="_blank" rel="noreferrer">
                  Cliente
                </a>
                .
              </>
            )}
        </span>
      </div>
    </div>
  );
}
