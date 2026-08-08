/**
 * The first thing anyone sees, exactly once. It answers the three things that
 * used to require guessing: what this is, that there are TWO applications in
 * two tabs, and in which order the five steps are walked.
 */

import type { ReactNode } from "react";

import { PASOS, type AppGuia } from "../guia";
import { MONO, Rotulo, SG } from "./base";
import { Boton } from "./Boton";

export function Bienvenida({
  app,
  onCerrar,
  onDemo,
}: {
  app: AppGuia;
  onCerrar: () => void;
  /** Cliente only: start the story on its own, for recording. */
  onDemo?: () => void;
}) {
  const esCliente = app === "cliente";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cómo se usa Phantom Trace"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(4, 8, 18, .78)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        overflow: "auto",
      }}
    >
      <div
        style={{
          background: "var(--pv-card)",
          border: "2px solid var(--pv-pulse)",
          maxWidth: 660,
          width: "100%",
          padding: "30px 32px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <img src="/isotipo.png" alt="" width={38} height={38} style={{ display: "block" }} />
          <div>
            <div style={{ font: `600 24px/1.1 ${SG}`, letterSpacing: "-.025em" }}>
              Phantom <span style={{ color: "var(--pv-pulse)" }}>Trace</span>
            </div>
            <Rotulo color="var(--pv-dim)">
              {esCliente ? "cliente · corre en tu máquina" : "explorer · lo público"}
            </Rotulo>
          </div>
        </div>

        <p style={{ font: `400 16px/1.6 ${SG}`, color: "var(--pv-muted)", margin: 0 }}>
          Una empleada denuncia a su empresa <strong style={{ color: "var(--pv-text)" }}>sin
          decir quién es</strong>, la evidencia queda sellada para que nadie la pueda cambiar
          después, y meses más tarde ella —y sólo ella— puede probar que la denuncia fue suya,
          ante la autoridad que elija.
        </p>

        <div
          style={{
            border: "1px solid var(--pv-h22)",
            background: "var(--pv-sunken)",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <Rotulo color="var(--pv-accent)">Se recorre en orden, de 1 a 5</Rotulo>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 9 }}>
            {PASOS.map((paso) => (
              <li key={paso.n} style={{ display: "flex", gap: 11, alignItems: "baseline" }}>
                <span
                  style={{
                    font: `600 11px/1.4 ${MONO}`,
                    color: paso.app === app ? "var(--pv-pulse)" : "var(--pv-dim)",
                    flex: "none",
                    width: 14,
                  }}
                >
                  {paso.n}
                </span>
                <span style={{ font: `400 14.5px/1.4 ${SG}` }}>
                  {paso.titulo}
                  <span style={{ color: "var(--pv-dim)", font: `400 12px/1.4 ${MONO}` }}>
                    {" · "}
                    {paso.app === app ? "acá" : "en la otra pestaña"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p style={{ font: `400 13px/1.55 ${SG}`, color: "var(--pv-dim)", margin: 0 }}>
            Los pasos que todavía no corresponden están cerrados con candado: no se puede
            saltear ninguno. La barra de arriba te va a decir siempre dónde estás.
          </p>
        </div>

        <Nota>
          Son <strong style={{ color: "var(--pv-text)" }}>dos aplicaciones distintas</strong>, en
          dos pestañas del browser. El Cliente ({esCliente ? "esta" : "la otra"}) corre en tu
          máquina y ve lo privado; el Explorer sólo lee la cadena pública. No comparten servidor
          ni sesión: lo único que las conecta es que vos copiás y pegás un texto.
        </Nota>

        <div style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
          <Boton tamano="medio" onClick={onCerrar} style={{ flex: "1 1 200px" }}>
            {esCliente ? "Empezar por el paso 1" : "Entendido"}
          </Boton>
          {onDemo && (
            <Boton
              variante="tinta"
              tamano="medio"
              onClick={() => {
                onCerrar();
                onDemo();
              }}
              style={{ flex: "1 1 200px" }}
            >
              ▶ Ver la demo sola
            </Boton>
          )}
        </div>
      </div>
    </div>
  );
}

function Nota({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        borderLeft: "2px solid var(--pv-accent)",
        paddingLeft: 14,
        font: `400 13.5px/1.6 ${SG}`,
        color: "var(--pv-muted)",
      }}
    >
      {children}
    </div>
  );
}
