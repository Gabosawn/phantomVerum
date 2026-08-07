import type { ReactNode } from "react";

import { SelloZK } from "@shared/componentes/base";
import { URL_CLIENTE, URL_EXPLORER } from "@shared/demo";

const MONO = "JetBrains Mono, ui-monospace, monospace";
const SG = "Space Grotesk, system-ui, sans-serif";
const INTER = "Inter, system-ui, sans-serif";

const PULSE = "#2E6BFF";
const PULSEHI = "#7AA2FF";
const VOID = "#07090F";
const GRAPHITE = "#0E1219";
const PANEL = "#12161F";
const NAVY = "#0A1226";
const LINE = "#1E2430";
const STEEL = "#5A6478";
const BONE = "#EDEAE6";
const PROBADO = "#12876E";
const RECHAZO = "#C4453A";

/**
 * Hoja de referencia del sistema visual — para el deck y para que un juez vea
 * que hay sistema atrás y no decisiones sueltas.
 *
 * Deliberadamente NO usa los tokens temáticos: es una hoja de referencia en el
 * registro oscuro de la marca, fiel al manual de branding de Phantom Trace.
 */
export function Pagina() {
  return (
    <div
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "0 0 100px",
        background: GRAPHITE,
        boxShadow: `0 0 0 1px rgba(237, 234, 230, .12)`,
      }}
    >
      <div
        style={{
          padding: "44px 60px 36px",
          borderBottom: "2px solid " + PULSE,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 40,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              font: `500 11px/1 ${MONO}`,
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: PULSE,
              marginBottom: 16,
            }}
          >
            Sistema visual · Midnight Hack BA 2026
          </div>
          <h1 style={{ font: `700 64px/.94 ${SG}`, margin: 0, letterSpacing: "-.05em", color: BONE }}>
            Phantom <span style={{ color: PULSE }}>Trace</span>
          </h1>
          <p
            style={{
              font: `300 18px/1.5 ${INTER}`,
              color: PULSEHI,
              margin: "14px 0 0",
              maxWidth: "54ch",
              textWrap: "pretty",
            }}
          >
            Deja un rastro que solo vos podés revelar.
          </p>
        </div>
        <img
          src="/logo-stacked.png"
          alt="Phantom Trace"
          style={{ flex: "none", width: 200, display: "block" }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          borderBottom: "1px solid rgba(237, 234, 230, .14)",
        }}
      >
        <div style={{ padding: "30px 36px 30px 60px", borderRight: "1px solid rgba(237,234,230,.14)" }}>
          <Rotulito>De dónde sale</Rotulito>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              font: `400 15px/1.65 ${INTER}`,
              color: BONE,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <li>
              El manual de marca define la paleta: <Fuerte c={PULSE}>Pulse</Fuerte> como único acento
              sobre fondos oscuros Void / Graphite / Panel / Navy.
            </li>
            <li>
              Los neutros son <Cod>{BONE}</Cod> (texto e isotipo), <Cod>{STEEL}</Cod> (texto
              secundario) y <Cod>{LINE}</Cod> (bordes y separadores).
            </li>
            <li>
              Regla del manual: si una composición tiene más de 5% de Pulse, hay demasiado azul.
              El acento nunca decora, siempre significa detección o dato vivo.
            </li>
          </ul>
        </div>
        <div style={{ padding: "30px 60px 30px 36px" }}>
          <Rotulito>La regla que ordena todo</Rotulito>
          <p
            style={{
              font: `400 15px/1.65 ${INTER}`,
              color: BONE,
              margin: "0 0 12px",
              textWrap: "pretty",
            }}
          >
            El dual-ledger de Midnight se traduce en <strong>dos aplicaciones separadas</strong>.
            Ambas arrancan oscuras, alineadas con la marca; cada una puede invertirse para proyectar.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              font: `400 14px/1.5 ${INTER}`,
              color: BONE,
            }}
          >
            <div style={{ display: "flex", gap: 11 }}>
              <span style={{ width: 14, height: 14, background: VOID, flex: "none", marginTop: 3 }} />
              <span>
                <strong>Cliente</strong> — oscuro. Corre en tu máquina, tiene proof server, guarda
                witnesses.
              </span>
            </div>
            <div style={{ display: "flex", gap: 11 }}>
              <span style={{ width: 14, height: 14, background: NAVY, flex: "none", marginTop: 3 }} />
              <span>
                <strong>Explorer</strong> — oscuro. Lee la cadena, no tiene proof server, no recibe
                nada privado.
              </span>
            </div>
          </div>
          <p
            style={{
              font: `400 13.5px/1.6 ${INTER}`,
              color: STEEL,
              margin: "16px 0 0",
              textWrap: "pretty",
            }}
          >
            Verde sólo para autoría probada, rojo sólo para el caso no designado. Nada más lleva
            color.
          </p>
        </div>
      </div>

      <div style={{ padding: "44px 60px 0" }}>
        <Titulo>Color</Titulo>
        <Rotulito>Fondos</Rotulito>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            border: "1.5px solid " + LINE,
            marginBottom: 10,
          }}
        >
          <Muestra nombre="void" hex={VOID} texto={BONE} />
          <Muestra nombre="graphite" hex={GRAPHITE} texto={BONE} borde />
          <Muestra nombre="panel" hex={PANEL} texto={BONE} borde />
          <Muestra nombre="navy" hex={NAVY} texto={BONE} borde />
        </div>
        <Rotulito style={{ marginTop: 28 }}>Texto y acento</Rotulito>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            border: "1.5px solid " + LINE,
            marginBottom: 10,
          }}
        >
          <Muestra nombre="bone" hex={BONE} texto={VOID} />
          <Muestra nombre="steel" hex={STEEL} texto={BONE} borde />
          <Muestra nombre="pulse" hex={PULSE} texto={VOID} borde />
          <Muestra nombre="pulse hi" hex={PULSEHI} texto={VOID} borde />
        </div>
        <Rotulito style={{ marginTop: 28 }}>Soporte y semántica</Rotulito>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            border: "1.5px solid " + LINE,
            marginBottom: 12,
          }}
        >
          <Muestra nombre="line" hex={LINE} texto={BONE} />
          <Muestra nombre="probado" hex={PROBADO} texto={VOID} borde />
          <Muestra nombre="rechazo" hex={RECHAZO} texto={VOID} borde />
        </div>
        <p
          style={{
            font: `400 14px/1.55 ${INTER}`,
            color: STEEL,
            margin: "0 0 40px",
            maxWidth: "78ch",
          }}
        >
          El <Fuerte c={PULSE}>azul Pulse</Fuerte> sólo para acción y sellado; el{" "}
          <Fuerte c={PROBADO}>verde</Fuerte> sólo para autoría probada; el{" "}
          <Fuerte c={RECHAZO}>rojo</Fuerte> sólo para el caso no designado. Nada más lleva color, y
          Pulse nunca pasa del 5% de la composición.
        </p>

        <Titulo>Tipografía</Titulo>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: 32,
            borderTop: "1px solid rgba(237,234,230,.18)",
            paddingTop: 24,
            marginBottom: 44,
          }}
        >
          <div>
            <Rotulito>Space Grotesk · display y wordmark</Rotulito>
            <div style={{ font: `700 56px/1 ${SG}`, letterSpacing: "-.045em", color: BONE }}>
              Autoría probada
            </div>
            <div style={{ font: `500 24px/1.3 ${SG}`, marginTop: 12, letterSpacing: "-.02em", color: BONE }}>
              Sellar y denunciar
            </div>
            <p style={{ font: `400 14px/1.55 ${INTER}`, color: STEEL, marginTop: 12 }}>
              700 para veredictos y portada, 600 para títulos de pantalla, 500 para botones y
              labels. Tracking negativo en todo lo grande.
            </p>
          </div>
          <div>
            <Rotulito>Inter · cuerpo de interfaz</Rotulito>
            <p
              style={{
                font: `400 15px/1.65 ${INTER}`,
                color: BONE,
                margin: 0,
                maxWidth: "46ch",
                textWrap: "pretty",
              }}
            >
              El cuerpo de la interfaz. Light 300 para taglines, Regular 400 para párrafos y
              controles. Interlineado 1.65.
            </p>
            <div style={{ marginTop: 18 }}>
              <Rotulito>JetBrains Mono · datos y etiquetas</Rotulito>
              <div style={{ font: `500 18px/1.4 ${MONO}`, color: PULSEHI, wordBreak: "break-all" }}>
                0x8f3c9d1e
                <br />
                a41d02b7
              </div>
              <p style={{ font: `400 14px/1.55 ${INTER}`, color: STEEL, marginTop: 12 }}>
                Todo hash, clave, nullifier y label de sistema. Tracking amplio en las etiquetas,
                siempre partible. Mínimo 12 px proyectado.
              </p>
            </div>
          </div>
        </div>

        <Titulo>Recursos</Titulo>
        <p
          style={{
            font: `400 15px/1.55 ${INTER}`,
            color: STEEL,
            margin: "0 0 22px",
            maxWidth: "72ch",
          }}
        >
          Cuatro piezas hacen todo el trabajo semántico del producto.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          <div style={{ border: `1.5px solid ${LINE}`, background: PANEL, padding: 20 }}>
            <Rotulito color={PULSEHI}>Barra de censura</Rotulito>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {["secret", "evidencia"].map((n) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ font: `500 11px ${MONO}`, color: STEEL, width: 62, flex: "none" }}>
                    {n}
                  </span>
                  <span style={{ flex: 1, height: 15, background: PULSE }} />
                </div>
              ))}
            </div>
            <p style={{ font: `400 13px/1.5 ${INTER}`, color: STEEL, marginTop: 15, marginBottom: 0 }}>
              Lo privado se muestra <em style={{ color: BONE }}>existiendo</em>, sin mostrarse.
              Pulse sobre oscuro.
            </p>
          </div>

          <div
            style={{
              border: `1.5px solid ${LINE}`,
              background: VOID,
              padding: 20,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Rotulito color={PULSEHI}>Sello · isotipo</Rotulito>
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 10px" }}>
              <SelloZK tamano={84} />
            </div>
            <p style={{ font: `400 13px/1.5 ${INTER}`, color: STEEL, marginTop: "auto", marginBottom: 0 }}>
              El isotipo: tres barras — dos grandes (el flujo, el ruido) y una corta en Pulse (la
              señal). Aparece una sola vez por pantalla, cuando algo quedó sellado on-chain.
            </p>
          </div>

          <div
            style={{
              border: `1.5px solid ${LINE}`,
              background: PANEL,
              padding: 20,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Rotulito color={PULSEHI}>La línea de marca y el trace</Rotulito>
            <div style={{ display: "flex", flexDirection: "column", height: 92, border: `1px solid ${LINE}` }}>
              <div style={{ flex: 1, background: GRAPHITE }} />
              <div style={{ height: 3, background: PULSE, flex: "none" }} />
              <div style={{ flex: 1, background: VOID }} />
            </div>
            <TraceElement />
            <p style={{ font: `400 13px/1.5 ${INTER}`, color: STEEL, marginTop: 15, marginBottom: 0 }}>
              La línea marca el borde del header en las dos apps. El rastro punteado asciende y
              termina en un punto Pulse — el momento revelado: latente en Steel, revelado en Pulse.
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          margin: "44px 60px 0",
          borderTop: "2px solid " + PULSE,
          paddingTop: 24,
          display: "flex",
          justifyContent: "space-between",
          gap: 40,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <Rotulito>Aplicado</Rotulito>
          <div
            style={{
              font: `500 21px/1.4 ${SG}`,
              maxWidth: "52ch",
              textWrap: "pretty",
              letterSpacing: "-.02em",
              color: BONE,
            }}
          >
            Dos aplicaciones:{" "}
            <a href={URL_CLIENTE} style={{ color: PULSEHI }}>
              Cliente
            </a>{" "}
            — denunciar, revelar autoría, emitir credenciales — y{" "}
            <a href={URL_EXPLORER} style={{ color: PULSEHI }}>
              Explorer
            </a>{" "}
            — ledger, verificar sello, verificar autoría.
          </div>
        </div>
        <div
          style={{
            flex: "none",
            font: `400 12.5px/1.7 ${MONO}`,
            color: STEEL,
            textAlign: "right",
          }}
        >
          Midnight Hack BA 2026
          <br />
          <span style={{ color: PULSEHI }}>UX &amp; Design = 15 %</span>
        </div>
      </div>
    </div>
  );
}

/** El rastro — punteado ascendente que termina en un punto Pulse. */
function TraceElement() {
  return (
    <svg
      viewBox="0 0 200 60"
      width="100%"
      style={{ display: "block", marginTop: 14 }}
      aria-hidden="true"
    >
      <circle cx="8" cy="30" r="3" fill={STEEL} />
      <circle cx="24" cy="26" r="3" fill={STEEL} />
      <circle cx="40" cy="22" r="3" fill={STEEL} />
      <circle cx="56" cy="18" r="3" fill={STEEL} />
      <circle cx="72" cy="15" r="3" fill={PULSEHI} />
      <circle cx="192" cy="8" r="7" fill={PULSE} />
    </svg>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return (
    <div style={{ font: `600 32px/1 ${SG}`, letterSpacing: "-.035em", marginBottom: 22, color: BONE }}>
      {children}
    </div>
  );
}

function Rotulito({
  children,
  color = STEEL,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        font: `600 10px/1 ${MONO}`,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        color,
        marginBottom: 13,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Cod({ children }: { children: ReactNode }) {
  return (
    <code style={{ font: `500 13px ${MONO}`, background: PANEL, color: PULSEHI, padding: "1px 5px" }}>
      {children}
    </code>
  );
}

function Fuerte({ children, c }: { children: ReactNode; c: string }) {
  return <span style={{ color: c, fontWeight: 500 }}>{children}</span>;
}

function Muestra({
  nombre,
  hex,
  texto,
  borde,
}: {
  nombre: string;
  hex: string;
  texto: string;
  borde?: boolean;
}) {
  return (
    <div
      style={{
        aspectRatio: "1 / .66",
        background: hex,
        display: "flex",
        alignItems: "flex-end",
        padding: 11,
        font: `500 9.5px/1.35 ${MONO}`,
        color: texto,
        borderLeft: borde ? `1.5px solid ${LINE}` : undefined,
      }}
    >
      {nombre}
      <br />
      {hex}
    </div>
  );
}
