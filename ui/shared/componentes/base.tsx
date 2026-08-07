import type { CSSProperties, ReactNode } from "react";

export const MONO = "IBM Plex Mono, ui-monospace, monospace";
export const SG = "Space Grotesk, system-ui, sans-serif";

/** Rótulo chico versalita — el label de sistema del diseño. */
export function Rotulo({
  children,
  color = "var(--pv-text)",
  tracking = ".14em",
  style,
}: {
  children: ReactNode;
  color?: string;
  tracking?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        font: `600 10px/1 ${MONO}`,
        letterSpacing: tracking,
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * Encabezado de pantalla: rótulo · filete · rótulo, título grande y bajada.
 * Es lo que dice de entrada dónde estás parado — en tu máquina o en lo público.
 */
export function Encabezado({
  kicker,
  kickerColor = "var(--pv-accent)",
  derecha,
  titulo,
  children,
}: {
  kicker: ReactNode;
  kickerColor?: string;
  derecha?: ReactNode;
  titulo: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Rotulo color={kickerColor} tracking=".16em">
          {kicker}
        </Rotulo>
        <span style={{ flex: 1, height: 1, background: "var(--pv-h22)" }} />
        {derecha && (
          <span
            style={{
              font: `500 10px/1 ${MONO}`,
              letterSpacing: ".08em",
              color: "var(--pv-dim)",
              flex: "none",
            }}
          >
            {derecha}
          </span>
        )}
      </div>
      <h2
        style={{
          font: `600 clamp(32px, 3.6vw, 46px)/1.04 ${SG}`,
          margin: "0 0 12px",
          letterSpacing: "-.035em",
        }}
      >
        {titulo}
      </h2>
      {children && (
        <p
          style={{
            font: `400 16px/1.6 ${SG}`,
            color: "var(--pv-muted)",
            margin: 0,
            maxWidth: "64ch",
            textWrap: "pretty",
          }}
        >
          {children}
        </p>
      )}
    </div>
  );
}

/**
 * `suave` = Cliente (borde tenue sobre oscuro).
 * `dura`  = Explorer (borde de tinta, registro de documento público).
 */
export function Tarjeta({
  titulo,
  derecha,
  variante = "suave",
  children,
  style,
}: {
  titulo?: ReactNode;
  derecha?: ReactNode;
  variante?: "suave" | "dura";
  children: ReactNode;
  style?: CSSProperties;
}) {
  const dura = variante === "dura";
  return (
    <div
      style={{
        border: `1.5px solid ${dura ? "var(--pv-text)" : "var(--pv-h28)"}`,
        background: "var(--pv-card)",
        ...style,
      }}
    >
      {titulo && (
        <div
          style={{
            padding: "11px 20px",
            borderBottom: `${dura ? "1.5px" : "1px"} solid ${dura ? "var(--pv-text)" : "var(--pv-h18)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Rotulo>{titulo}</Rotulo>
          {derecha && (
            <span style={{ font: `500 10px/1 ${MONO}`, color: "var(--pv-dim)" }}>{derecha}</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Barra de censura — el recurso central del sistema visual.
 *
 * Muestra que un dato privado EXISTE sin mostrarlo. No es un asterisco ni un
 * placeholder: es la afirmación de que ese valor está acá y no viajó.
 */
export function BarraCensura({
  etiqueta,
  sub,
  estado,
  estadoColor = "var(--pv-pos)",
  color = "var(--pv-accent)",
  ancho = 150,
  conBorde = true,
}: {
  etiqueta: ReactNode;
  sub?: ReactNode;
  estado?: ReactNode;
  estadoColor?: string;
  color?: string;
  ancho?: number;
  conBorde?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "13px 0",
        borderBottom: conBorde ? "1px solid var(--pv-h10)" : undefined,
      }}
    >
      <span
        style={{
          font: `500 11px/1.3 ${MONO}`,
          color: "var(--pv-muted)",
          width: ancho,
          flex: "none",
          letterSpacing: ".04em",
        }}
      >
        {etiqueta}
        {sub && (
          <>
            <br />
            <span style={{ color: "var(--pv-dim)" }}>{sub}</span>
          </>
        )}
      </span>
      <span style={{ flex: 1, height: 17, background: color }} />
      {estado && (
        <span style={{ font: `500 11px/1 ${MONO}`, color: estadoColor, flex: "none" }}>
          {estado}
        </span>
      )}
    </div>
  );
}

/**
 * Sello octogonal — la silueta del logo. Aparece UNA sola vez por pantalla,
 * cuando algo quedó sellado on-chain.
 */
export function SelloZK({ tamano = 88 }: { tamano?: number }) {
  return (
    <div
      style={{
        width: tamano,
        height: tamano,
        clipPath: "polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)",
        background: "var(--pv-violeta)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#151520",
        textAlign: "center",
        flex: "none",
      }}
    >
      <div style={{ font: `600 8px/1.2 ${MONO}`, letterSpacing: ".12em" }}>SELLADO</div>
      <div style={{ font: `700 21px/1 ${SG}`, margin: "3px 0 2px", letterSpacing: "-.03em" }}>
        ZK
      </div>
      <div style={{ font: `500 7.5px/1.2 ${MONO}`, letterSpacing: ".08em" }}>MIDNIGHT</div>
    </div>
  );
}

/**
 * El bloque de fórmula con la línea violeta: exactamente qué valores cruzan.
 * En el Cliente siempre precede al botón que firma.
 */
export function LineaFormula({ titulo, children }: { titulo: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        borderLeft: "2px solid var(--pv-violeta)",
        padding: "4px 0 4px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <Rotulo color="var(--pv-accent)">{titulo}</Rotulo>
      <span
        style={{
          font: `500 14px/1.7 ${MONO}`,
          color: "var(--pv-muted)",
          wordBreak: "break-all",
        }}
      >
        {children}
      </span>
    </div>
  );
}

/** Los pasos que el proof server va reportando, en vivo. */
export function PasosProof({ titulo, pasos }: { titulo: ReactNode; pasos: string[] }) {
  return (
    <div
      style={{
        border: "1.5px solid var(--pv-violeta)",
        background: "var(--pv-card)",
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <Rotulo color="var(--pv-accent)">{titulo}</Rotulo>
      {pasos.map((paso, i) => (
        <div
          key={paso}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "baseline",
            font: `500 13px/1.55 ${MONO}`,
            color: "var(--pv-muted)",
          }}
        >
          <span style={{ width: 12, flex: "none", color: "var(--pv-pos)" }}>
            {i < pasos.length - 1 ? "✓" : "▸"}
          </span>
          <span>{paso}</span>
        </div>
      ))}
    </div>
  );
}

/** Par etiqueta/valor hexadecimal, el patrón de dato del sistema. */
export function Campo({
  etiqueta,
  valor,
  tamano = 13.5,
  color = "var(--pv-text)",
  fondo,
}: {
  etiqueta: ReactNode;
  valor: ReactNode;
  tamano?: number;
  color?: string;
  fondo?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span
        style={{
          font: `500 10px/1 ${MONO}`,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--pv-dim)",
        }}
      >
        {etiqueta}
      </span>
      <span
        className="pv-hex"
        style={{
          font: `500 ${tamano}px/1.45 ${MONO}`,
          color,
          background: fondo ? "var(--pv-sunken)" : undefined,
          border: fondo ? "1px solid var(--pv-h18)" : undefined,
          padding: fondo ? "11px 13px" : undefined,
        }}
      >
        {valor}
      </span>
    </div>
  );
}
