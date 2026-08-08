/**
 * The demo-mode bar: the story running by itself, narrated, so it can be
 * recorded in one take.
 *
 * It sits above the content and covers none of what is happening below — the
 * recording has to show the app working, not a banner on top of it.
 */

import { Boton } from "@shared/componentes/Boton";
import { MONO, Rotulo, SG } from "@shared/componentes/base";

import { useCliente } from "./estado";

export function BarraDemo() {
  const e = useCliente();
  if (!e.demoActiva) return null;

  const total = e.guion.length;
  const terminada = e.demoEscena >= total;
  const escena = terminada ? null : e.guion[e.demoEscena];

  return (
    <div
      style={{
        background: "var(--pv-card)",
        borderBottom: `2px solid ${terminada ? "var(--pv-pos)" : "var(--pv-pulse)"}`,
        padding: "13px 20px",
        display: "flex",
        alignItems: "center",
        gap: 18,
        flexWrap: "wrap",
        flex: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "none" }}>
        <Rotulo color={terminada ? "var(--pv-pos)" : "var(--pv-pulse)"} tracking=".16em">
          {terminada ? "demo terminada" : e.demoPausada ? "demo · en pausa" : "demo"}
        </Rotulo>
        <span style={{ display: "flex", gap: 4 }} aria-hidden="true">
          {e.guion.map((paso, i) => (
            <span
              key={paso.rotulo}
              title={paso.rotulo}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background:
                  i < e.demoEscena
                    ? "var(--pv-pos)"
                    : i === e.demoEscena && !terminada
                      ? "var(--pv-pulse)"
                      : "var(--pv-h30)",
              }}
            />
          ))}
        </span>
      </div>

      <p
        style={{
          font: `400 15px/1.5 ${SG}`,
          color: "var(--pv-text)",
          margin: 0,
          flex: "1 1 320px",
          minWidth: 0,
          textWrap: "pretty",
        }}
      >
        {terminada ? (
          <>
            Eso es todo: denuncia anónima, evidencia sellada y autoría probada meses después ante
            una sola autoridad. El último paso —la verificación— se hace en el Explorer.
          </>
        ) : (
          <>
            <span style={{ font: `500 12px/1.5 ${MONO}`, color: "var(--pv-dim)" }}>
              {e.demoEscena + 1}/{total} · {escena?.rotulo}
              {"  "}
            </span>
            {escena?.narracion}
          </>
        )}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "none" }}>
        {!terminada && (
          <>
            <Boton variante="fantasma" tamano="chico" onClick={e.pausarDemo}>
              {e.demoPausada ? "▶ seguir" : "❚❚ pausar"}
            </Boton>
            <Boton variante="fantasma" tamano="chico" onClick={e.saltarEscena}>
              ▸▸ saltar
            </Boton>
          </>
        )}
        {terminada && (
          <Boton variante="fantasma" tamano="chico" onClick={() => void e.reproducirDemo()}>
            ↺ de nuevo
          </Boton>
        )}
        <Boton variante="fantasma" tamano="chico" onClick={e.salirDemo}>
          salir
        </Boton>
      </div>
    </div>
  );
}
