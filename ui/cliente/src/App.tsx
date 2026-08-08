import { Bienvenida } from "@shared/componentes/Bienvenida";
import { Boton } from "@shared/componentes/Boton";
import { BotonTema, Cabecera, DatoHeader, Pestana } from "@shared/componentes/Cabecera";
import { Ahora, BarraPasos } from "@shared/componentes/Guia";
import { MONO, Rotulo, SG } from "@shared/componentes/base";
import { URL_EXPLORER } from "@shared/demo";
import { useTema } from "@shared/useTema";

import { BarraDemo } from "./BarraDemo";
import { useCliente, type Ruta } from "./estado";
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
      {!e.bienvenidaVista && (
        <Bienvenida
          app="cliente"
          onCerrar={e.cerrarBienvenida}
          onDemo={() => void e.reproducirDemo()}
        />
      )}

      <Cabecera
        // "local" y punto: los circuitos del Cliente corren siempre acá.
        etiqueta={["Cliente", "local"]}
        pestanas={
          <>
            <PestanaPaso ruta="emitir" n={1} titulo="Emitir credenciales" sub="lo hace la empresa" />
            <PestanaPaso ruta="denunciar" n={2} titulo="Denunciar" sub="sellás la evidencia" />
            <PestanaPaso ruta="revelar" n={4} titulo="Revelar autoría" sub="decís que fuiste vos" />
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
        {/*
          Dice si hay una wallet presente, y nada más. Antes leía `modo`, que
          se prendía al DETECTAR Preview aunque las operaciones siguieran
          corriendo contra el mock — un indicador que hablaba de otra cosa que
          la que mostraba.
        */}
        <DatoHeader titulo="wallet">
          {e.walletSession ? (
            <span style={{ color: "var(--pv-pos)" }}>detectada ✓</span>
          ) : (
            <span style={{ color: "var(--pv-muted)" }}>sin wallet</span>
          )}
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

      <BarraPasos
        app="cliente"
        actual={e.paso}
        onIr={(ruta) => e.irA(ruta as Ruta)}
        urlOtraApp={URL_EXPLORER}
        bloqueoDe={(ruta) => e.bloqueos[ruta as Ruta] ?? null}
        derecha={
          <>
            {!e.demoActiva && (
              <Boton
                variante="fantasma"
                tamano="chico"
                onClick={() => void e.reproducirDemo()}
                title="Corre la historia entera sola, narrada. Reinicia el estado local."
                style={{ borderColor: "var(--pv-pulse)", color: "var(--pv-pulse)" }}
              >
                ▶ VER DEMO
              </Boton>
            )}
            <Boton
              variante="fantasma"
              tamano="chico"
              onClick={() => {
                // Stops the demo if it was running: otherwise it would keep
                // advancing over state that was just wiped from under it.
                e.salirDemo();
                e.reiniciar();
              }}
              title="Vuelve al paso 1 y borra todo el estado local"
              style={{ borderColor: "var(--pv-h20)", color: "var(--pv-dim)" }}
            >
              ↺ empezar de nuevo
            </Boton>
          </>
        }
      />

      <BarraDemo />

      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div style={{ position: "absolute", inset: 0, overflow: "auto" }}>
          <main
            style={{
              boxSizing: "border-box",
              width: "100%",
              maxWidth: 920,
              margin: "0 auto",
              padding: "28px 44px 56px",
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

            {/* The instruction of the moment, always above everything else. */}
            <Ahora
              tono={e.instruccion.tono}
              titulo={e.instruccion.titulo}
              accion={
                e.instruccion.accion && (
                  <Boton
                    variante={e.instruccion.tono === "pulse" ? "pulse" : "tinta"}
                    tamano="medio"
                    onClick={e.instruccion.accion.hacer}
                  >
                    {e.instruccion.accion.texto}
                  </Boton>
                )
              }
            >
              {e.instruccion.detalle}
            </Ahora>

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

/** Tab numbered by its step, and locked while its turn has not come. */
function PestanaPaso({
  ruta,
  n,
  titulo,
  sub,
}: {
  ruta: Ruta;
  n: number;
  titulo: string;
  sub: string;
}) {
  const e = useCliente();
  return (
    <Pestana
      titulo={`${n} · ${titulo}`}
      sub={sub}
      activa={e.ruta === ruta}
      bloqueada={e.bloqueos[ruta]}
      onClick={() => e.irA(ruta)}
    />
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
          borderTop: "2px solid var(--pv-pulse)",
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
        borderTop: "2px solid var(--pv-pulse)",
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
