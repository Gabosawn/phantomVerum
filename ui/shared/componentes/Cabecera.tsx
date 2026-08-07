import type { ReactNode } from "react";
import { MONO, SG } from "./base";

/**
 * La línea violeta de 3 px del borde inferior es lo ÚNICO que las dos apps
 * comparten visualmente. Todo lo demás es opuesto a propósito.
 */
export function Cabecera({
  etiqueta,
  pestanas,
  children,
}: {
  /** "Cliente / local" o "Explorer / público". */
  etiqueta: [string, string];
  pestanas: ReactNode;
  /** Estado de la derecha: proof server, indexer, link a la otra app, tema. */
  children: ReactNode;
}) {
  return (
    <header
      style={{
        borderBottom: "2px solid var(--pv-violeta)",
        background: "var(--pv-surface)",
        flex: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "0 16px",
            borderRight: "1px solid var(--pv-h18)",
            flex: "none",
          }}
        >
          <img
            src="/marca.svg"
            alt=""
            width={29}
            height={29}
            style={{ display: "block", flex: "none" }}
          />
          <div style={{ font: `600 19px/1 ${SG}`, letterSpacing: "-.02em" }}>
            Phantom<span style={{ color: "var(--pv-violeta)" }}>Verum</span>
          </div>
          <div
            style={{
              font: `600 9px/1.3 ${MONO}`,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--pv-violeta)",
              border: "1px solid var(--pv-h40)",
              padding: "5px 7px",
            }}
          >
            {etiqueta[0]}
            <br />
            {etiqueta[1]}
          </div>
        </div>

        <nav style={{ display: "flex", alignItems: "stretch", flex: "0 1 auto", flexWrap: "wrap" }}>
          {pestanas}
        </nav>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "10px 16px",
            borderLeft: "1px solid var(--pv-h18)",
            flex: "0 0 auto",
            marginLeft: "auto",
            flexWrap: "wrap",
          }}
        >
          {children}
        </div>
      </div>
    </header>
  );
}

export function Pestana({
  titulo,
  sub,
  subColor = "var(--pv-muted)",
  activa,
  onClick,
}: {
  titulo: string;
  sub: string;
  subColor?: string;
  activa: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "page" : undefined}
      className="pv-nav"
      style={{
        appearance: "none",
        background: "none",
        border: "none",
        borderRight: "1px solid var(--pv-h12)",
        padding: "15px 15px 12px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        alignItems: "flex-start",
        textAlign: "left",
        color: "var(--pv-text)",
      }}
    >
      <span style={{ font: `500 13.5px/1 ${SG}` }}>{titulo}</span>
      <span
        style={{
          font: `500 9px/1 ${MONO}`,
          letterSpacing: ".08em",
          color: subColor,
          textTransform: "uppercase",
        }}
      >
        {sub}
      </span>
      <span
        style={{
          height: 3,
          background: activa ? "var(--pv-violeta)" : "transparent",
          alignSelf: "stretch",
          marginTop: 2,
        }}
      />
    </button>
  );
}

/** Bloque de dos renglones del sector derecho del header. */
export function DatoHeader({
  titulo,
  children,
  color = "var(--pv-text)",
}: {
  titulo: string;
  children: ReactNode;
  color?: string;
}) {
  return (
    <div style={{ font: `500 10px/1.35 ${MONO}`, color }}>
      {titulo}
      <br />
      {children}
    </div>
  );
}

export function BotonTema({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pv-btn-fantasma"
      title={`Cambiar a tema ${etiqueta}`}
      style={{
        border: "1px solid var(--pv-h28)",
        color: "var(--pv-muted)",
        font: `500 9.5px/1 ${MONO}`,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        gap: 7,
        flex: "none",
      }}
    >
      <span
        style={{
          width: 11,
          height: 11,
          borderRadius: "50%",
          border: "1.5px solid currentColor",
          background: "linear-gradient(90deg, currentColor 0 50%, transparent 50% 100%)",
          flex: "none",
        }}
      />
      {etiqueta}
    </button>
  );
}
