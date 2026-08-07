import { Boton } from "@shared/componentes/Boton";
import { BotonTema, Cabecera, DatoHeader, Pestana } from "@shared/componentes/Cabecera";
import { MONO, Rotulo, SG } from "@shared/componentes/base";
import { URL_EXPLORER } from "@shared/demo";
import { useTema } from "@shared/useTema";

import { useCliente } from "./estado";
import { Denunciar } from "./vistas/Denunciar";
import { Emitir } from "./vistas/Emitir";
import { Revelar } from "./vistas/Revelar";

export function App() {
  const e = useCliente();
  const tema = useTema("cliente", "oscuro");

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
        etiqueta={["Cliente", "local"]}
        pestanas={
          <>
            <Pestana
              titulo="Denunciar"
              sub="t2 · witness"
              activa={e.ruta === "denunciar"}
              onClick={() => e.setRuta("denunciar")}
            />
            <Pestana
              titulo="Revelar autoría"
              sub="t4 · designación"
              activa={e.ruta === "revelar"}
              onClick={() => e.setRuta("revelar")}
            />
            <Pestana
              titulo="Emitir credenciales"
              sub="t1 · issuer"
              activa={e.ruta === "emitir"}
              onClick={() => e.setRuta("emitir")}
            />
          </>
        }
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--pv-pos)",
              flex: "none",
              boxShadow: "0 0 0 3px rgba(95, 208, 180, .16)",
            }}
          />
          <DatoHeader titulo="proof server">
            <span style={{ color: "var(--pv-muted)" }}>local :6300</span>
          </DatoHeader>
        </div>
        <DatoHeader titulo="wallet">
          <span style={{ color: "var(--pv-muted)" }}>shielded</span>
        </DatoHeader>
        <a
          href={URL_EXPLORER}
          target="_blank"
          rel="noreferrer"
          style={{ font: `500 10px/1.35 ${MONO}`, letterSpacing: ".05em" }}
        >
          Explorer
          <br />
          público ↗
        </a>
        <BotonTema etiqueta={tema.etiqueta} onClick={tema.alternar} />
      </Cabecera>

      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div style={{ position: "absolute", inset: 0, overflow: "auto" }}>
          <main
            style={{
              boxSizing: "border-box",
              width: "100%",
              maxWidth: 920,
              margin: "0 auto",
              padding: "40px 44px 56px",
              display: "flex",
              flexDirection: "column",
              gap: 26,
            }}
          >
            {e.error && (
              <div
                role="alert"
                style={{
                  border: "1.5px solid var(--pv-neg)",
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ color: "var(--pv-neg)", font: `500 15px/1 ${MONO}` }}>✗</span>
                <span style={{ font: `500 13.5px/1.5 ${SG}`, flex: 1, minWidth: 200 }}>
                  {e.error}
                  <br />
                  <span style={{ color: "var(--pv-muted)", fontWeight: 400 }}>
                    Falló en proof time: no se emitió ninguna transacción.
                  </span>
                </span>
                <Boton variante="fantasma" tamano="chico" onClick={e.limpiarError}>
                  cerrar
                </Boton>
              </div>
            )}

            {e.ruta === "denunciar" && <Denunciar />}
            {e.ruta === "revelar" && <Revelar />}
            {e.ruta === "emitir" && <Emitir />}
          </main>
        </div>
      </div>

      <Terminal />
    </div>
  );
}

/**
 * El terminal del proof server. No es decoración: es la evidencia en pantalla
 * de que hay un proceso local haciendo el trabajo, y de que los witnesses no
 * viajan más lejos que eso. El Explorer no tiene nada parecido, porque no
 * tiene nada privado que procesar.
 */
function Terminal() {
  const e = useCliente();

  if (!e.terminalAbierta) {
    return (
      <div
        style={{
          background: "var(--pv-term)",
          borderTop: "2px solid var(--pv-violeta)",
          padding: "8px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          flex: "none",
        }}
      >
        <Rotulo color="var(--pv-dim)">proof server · localhost:6300</Rotulo>
        <Boton
          variante="fantasma"
          tamano="chico"
          onClick={() => e.setTerminalAbierta(true)}
          style={{ marginLeft: "auto", borderColor: "var(--pv-h20)", color: "var(--pv-dim)" }}
        >
          VER LOGS
        </Boton>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--pv-term)",
        borderTop: "2px solid var(--pv-violeta)",
        color: "var(--pv-muted)",
        flex: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: "8px 20px",
          borderBottom: "1px solid var(--pv-h12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span
            style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--pv-pos)", flex: "none" }}
          />
          <Rotulo>proof server · localhost:6300</Rotulo>
          <span style={{ font: `500 10px/1 ${MONO}`, color: "var(--pv-dim)" }}>
            este proceso solo existe en el Cliente
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <Rotulo color="var(--pv-dim)" style={{ fontSize: 9, marginRight: 4 }}>
            modo demo
          </Rotulo>
          <Boton variante="fantasma" tamano="chico" onClick={e.demoT1}>
            T1 emitir
          </Boton>
          <Boton variante="fantasma" tamano="chico" onClick={e.demoT2}>
            T2 denunciar
          </Boton>
          <Boton
            tamano="chico"
            onClick={e.demoT4}
            style={{ border: "1px solid var(--pv-violeta)" }}
          >
            T4 revelar
          </Boton>
          <Boton
            variante="fantasma"
            tamano="chico"
            onClick={e.nuevaIdentidad}
            title="Rota el secret personal. El Explorer no va a reconocer estas denuncias — y eso es correcto."
            style={{ borderColor: "var(--pv-h20)", color: "var(--pv-dim)" }}
          >
            otra identidad
          </Boton>
          <Boton
            variante="fantasma"
            tamano="chico"
            onClick={e.reiniciar}
            title="Borra todo el estado local"
            style={{ borderColor: "var(--pv-h20)", color: "var(--pv-dim)" }}
          >
            ↺
          </Boton>
          <Boton
            variante="fantasma"
            tamano="chico"
            onClick={() => e.setTerminalAbierta(false)}
            style={{ borderColor: "var(--pv-h20)", color: "var(--pv-dim)", marginLeft: 6 }}
          >
            OCULTAR
          </Boton>
        </div>
      </div>

      <div
        style={{
          padding: "12px 20px 14px",
          maxHeight: 116,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        {e.logs.map((l, i) => (
          <div
            key={`${l.t}-${i}`}
            style={{ display: "flex", gap: 14, font: `400 12.5px/1.45 ${MONO}` }}
          >
            <span style={{ color: "var(--pv-dim)", flex: "none" }}>{l.t}</span>
            <span style={{ color: "var(--pv-muted)" }}>{l.m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
