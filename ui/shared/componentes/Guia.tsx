/**
 * The orientation layer. It answers the three questions the app used to leave
 * unanswered: which step am I on, what do I do right now, and why is that
 * button dead.
 *
 * It sits ON TOP of the views without touching them: the step bar under the
 * header, the "Ahora" panel above the content, and the lock when a prerequisite
 * is missing.
 */

import { useState, type CSSProperties, type ReactNode } from "react";

import { GLOSARIO, PASOS, type AppGuia, type NumeroPaso } from "../guia";
import { MONO, Rotulo, SG } from "./base";

/* ── Step bar ─────────────────────────────────────────────────────────────── */

/**
 * All five steps, always all five, in both apps. The ones performed in the
 * OTHER application render dimmed and marked ↗: having step 5 visible from step
 * 1 is precisely what prevents the "and now where do I paste this" surprise.
 */
export function BarraPasos({
  app,
  actual,
  onIr,
  urlOtraApp,
  bloqueoDe,
  derecha,
}: {
  /** Which app is drawing this: steps owned by the other app are not clickable. */
  app: AppGuia;
  actual: NumeroPaso;
  /** Navigate to a step of THIS app. */
  onIr: (ruta: string) => void;
  /** Where to send the user when the step lives in the other app. */
  urlOtraApp: string;
  /** Why a step of this app is still locked, when it is. */
  bloqueoDe?: (ruta: string) => string | null;
  /** Far-right controls (demo mode, reset). */
  derecha?: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--pv-sunken)",
        borderBottom: "1px solid var(--pv-h18)",
        padding: "9px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        flex: "none",
      }}
    >
      <Rotulo color="var(--pv-dim)" tracking=".16em" style={{ flex: "none", marginRight: 2 }}>
        cómo se usa
      </Rotulo>

      <ol
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 6,
          listStyle: "none",
          margin: 0,
          padding: 0,
          flexWrap: "wrap",
          flex: "1 1 auto",
        }}
      >
        {PASOS.map((paso) => {
          const ajeno = paso.app !== app;
          // A step from the other app is never marked done: this application
          // has no way of knowing, and the bar must not claim more than it can.
          const estado = ajeno
            ? "pendiente"
            : paso.n < actual
              ? "hecho"
              : paso.n === actual
                ? "actual"
                : "pendiente";
          const cerrado = ajeno ? null : (bloqueoDe?.(paso.ruta) ?? null);
          return (
            <li key={paso.n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Paso
                n={paso.n}
                titulo={paso.titulo}
                estado={estado}
                ajeno={ajeno}
                cerrado={cerrado}
                onClick={() => {
                  if (ajeno) window.open(urlOtraApp, "_blank", "noreferrer");
                  else onIr(paso.ruta);
                }}
              />
              {paso.n < 5 && (
                <span
                  aria-hidden="true"
                  style={{ width: 10, height: 1, background: "var(--pv-h22)", flex: "none" }}
                />
              )}
            </li>
          );
        })}
      </ol>

      {derecha && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "none" }}>{derecha}</div>
      )}
    </div>
  );
}

function Paso({
  n,
  titulo,
  estado,
  ajeno,
  cerrado,
  onClick,
}: {
  n: number;
  titulo: string;
  estado: "hecho" | "actual" | "pendiente";
  ajeno: boolean;
  /** Reason the step cannot be entered yet, when it is locked. */
  cerrado: string | null;
  onClick: () => void;
}) {
  const actual = estado === "actual";
  const hecho = estado === "hecho";
  const color = cerrado
    ? "var(--pv-dim)"
    : actual
      ? "var(--pv-pulse)"
      : hecho
        ? "var(--pv-pos)"
        : ajeno
          ? "var(--pv-dim)"
          : "var(--pv-muted)";

  return (
    <button
      type="button"
      onClick={cerrado ? undefined : onClick}
      disabled={Boolean(cerrado)}
      aria-current={actual ? "step" : undefined}
      aria-disabled={Boolean(cerrado) || undefined}
      className="pv-btn-fantasma"
      title={
        cerrado
          ? `Paso ${n} · bloqueado — ${cerrado}`
          : ajeno
            ? `Paso ${n} · se hace en la otra aplicación — abre en una pestaña nueva`
            : `Ir al paso ${n}: ${titulo}`
      }
      style={{
        appearance: "none",
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 9px",
        border: `1px solid ${actual && !cerrado ? "var(--pv-pulse)" : "var(--pv-h18)"}`,
        background: actual && !cerrado ? "var(--pv-card)" : "transparent",
        color,
        cursor: cerrado ? "not-allowed" : "pointer",
        flex: "none",
      }}
    >
      <span
        style={{
          font: `600 10px/1 ${MONO}`,
          width: 15,
          height: 15,
          borderRadius: "50%",
          border: `1.5px solid ${color}`,
          background: hecho ? color : "transparent",
          color: hecho ? "var(--pv-surface)" : color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
        }}
      >
        {hecho ? "✓" : cerrado ? "·" : n}
      </span>
      <span style={{ font: `${actual ? 600 : 500} 11.5px/1.2 ${SG}`, whiteSpace: "nowrap" }}>
        {titulo}
        {cerrado ? (
          <span aria-hidden="true"> 🔒</span>
        ) : (
          ajeno && <span style={{ color: "var(--pv-dim)" }}> ↗</span>
        )}
      </span>
    </button>
  );
}

/* ── The "do this now" panel ──────────────────────────────────────────────── */

/**
 * One instruction at a time, imperative, with the button that carries it out
 * right beside it. If this is not enough to know what to click, the screen is
 * wrong.
 */
export function Ahora({
  titulo,
  children,
  accion,
  tono = "pulse",
}: {
  titulo: ReactNode;
  children?: ReactNode;
  /** The button that does exactly what the text says. */
  accion?: ReactNode;
  /** `pulse` = carry on · `alerta` = something is missing · `fin` = done. */
  tono?: "pulse" | "alerta" | "fin";
}) {
  const color =
    tono === "alerta" ? "var(--pv-neg)" : tono === "fin" ? "var(--pv-pos)" : "var(--pv-pulse)";

  return (
    <div
      style={{
        border: `1.5px solid ${color}`,
        background: "var(--pv-card)",
        padding: "16px 18px",
        display: "flex",
        gap: 15,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{ font: `500 15px/1.25 ${MONO}`, color, flex: "none", width: 14 }}
      >
        {tono === "alerta" ? "!" : tono === "fin" ? "✓" : "▸"}
      </span>
      <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <Rotulo color={color} tracking=".16em">
            {tono === "alerta" ? "falta un paso" : tono === "fin" ? "listo" : "ahora"}
          </Rotulo>
        </div>
        <div style={{ font: `600 18px/1.3 ${SG}`, letterSpacing: "-.02em", textWrap: "pretty" }}>
          {titulo}
        </div>
        {children && (
          <div
            style={{
              font: `400 14px/1.6 ${SG}`,
              color: "var(--pv-muted)",
              maxWidth: "70ch",
              textWrap: "pretty",
            }}
          >
            {children}
          </div>
        )}
      </div>
      {accion && <div style={{ flex: "none", alignSelf: "center" }}>{accion}</div>}
    </div>
  );
}

/* ── Inline glossary ──────────────────────────────────────────────────────── */

/**
 * A technical word with its translation one click away. The jargon stays — the
 * deck needs it — but stops being a wall: anyone can ask the screen itself what
 * it means.
 */
export function Termino({
  children,
  clave,
  style,
}: {
  children: ReactNode;
  /** GLOSARIO entry. Defaults to the rendered text itself. */
  clave?: string;
  style?: CSSProperties;
}) {
  const [abierto, setAbierto] = useState(false);
  const k = clave ?? (typeof children === "string" ? children : "");
  const definicion = GLOSARIO[k];

  if (!definicion) return <>{children}</>;

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        title="¿Qué significa?"
        style={{
          appearance: "none",
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          color: "inherit",
          cursor: "help",
          borderBottom: "1px dotted var(--pv-accent)",
          ...style,
        }}
      >
        {children}
        <span style={{ font: `600 9px/1 ${MONO}`, color: "var(--pv-accent)", verticalAlign: "super" }}>
          {" "}
          ?
        </span>
      </button>
      {abierto && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 40,
            top: "calc(100% + 7px)",
            left: 0,
            width: 290,
            background: "var(--pv-card)",
            border: "1.5px solid var(--pv-accent)",
            padding: "11px 13px",
            font: `400 13px/1.55 ${SG}`,
            color: "var(--pv-text)",
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
            textTransform: "none",
            letterSpacing: "normal",
          }}
        >
          {definicion}
        </span>
      )}
    </span>
  );
}
