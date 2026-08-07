import type { CSSProperties, ReactNode } from "react";
import { MONO, SG } from "./base";

/**
 * `violeta` — la acción que firma y publica. Una por pantalla, nunca dos.
 * `tinta`   — acciones fuertes que no tocan la cadena (descargar, comparar).
 * `fantasma`— controles de servicio: demo, reset, ocultar.
 */
export function Boton({
  variante = "violeta",
  tamano = "grande",
  sub,
  children,
  onClick,
  disabled,
  style,
  title,
}: {
  variante?: "violeta" | "tinta" | "fantasma";
  tamano?: "grande" | "medio" | "chico";
  /** El nombre del circuito, en monoespaciado y atenuado. */
  sub?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  const clase =
    variante === "violeta"
      ? "pv-btn-primario"
      : variante === "tinta"
        ? "pv-btn-tinta"
        : "pv-btn-fantasma";

  const porTamano: Record<string, CSSProperties> = {
    grande: { padding: "22px 24px", font: `600 20px/1 ${SG}`, letterSpacing: "-.015em" },
    medio: { padding: "16px 20px", font: `600 16px/1 ${SG}` },
    chico: { padding: "8px 10px", font: `500 10px/1 ${MONO}`, letterSpacing: ".06em" },
  };

  return (
    <button
      type="button"
      className={clase}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        appearance: "none",
        width: tamano === "chico" ? undefined : "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        ...(variante === "fantasma"
          ? { border: "1px solid var(--pv-h28)", color: "var(--pv-muted)" }
          : {}),
        ...porTamano[tamano],
        ...style,
      }}
    >
      {children}
      {sub && <span style={{ font: `500 12px ${MONO}`, opacity: 0.7 }}>{sub}</span>}
    </button>
  );
}

/** Opción seleccionable con punto — verificadores, documentos, empleados. */
export function Opcion({
  seleccionada,
  onClick,
  titulo,
  sub,
  icono,
}: {
  seleccionada: boolean;
  onClick: () => void;
  titulo: ReactNode;
  sub: ReactNode;
  /** Reemplaza el punto de radio por un glifo (p. ej. ▤ para archivos). */
  icono?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionada}
      className="pv-opcion"
      style={{
        appearance: "none",
        width: "100%",
        background: "var(--pv-sunken)",
        border: `1.5px solid ${seleccionada ? "var(--pv-accent)" : "var(--pv-h22)"}`,
        padding: "14px 16px",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 13,
        color: "var(--pv-text)",
      }}
    >
      {icono ?? (
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: "1.5px solid var(--pv-accent)",
            background: seleccionada ? "var(--pv-accent)" : "transparent",
            flex: "none",
          }}
        />
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ font: `500 14.5px/1.3 ${SG}`, display: "block" }}>{titulo}</span>
        <span style={{ font: `400 11px/1.5 ${MONO}`, color: "var(--pv-dim)" }}>{sub}</span>
      </span>
    </button>
  );
}
