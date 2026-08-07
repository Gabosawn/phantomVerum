import type { ReactNode } from "react";

import { SelloZK } from "@shared/componentes/base";
import { URL_CLIENTE, URL_EXPLORER } from "@shared/demo";

const MONO = "IBM Plex Mono, ui-monospace, monospace";
const SG = "Space Grotesk, system-ui, sans-serif";

/**
 * Hoja de referencia del sistema visual — para el deck y para que un juez vea
 * que hay sistema atrás y no decisiones sueltas.
 *
 * Deliberadamente NO usa los tokens temáticos: es una hoja impresa, siempre en
 * el mismo registro, y muestra los colores de las dos apps al mismo tiempo.
 */
export function Pagina() {
  return (
    <div
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "0 0 100px",
        background: "#F1F2F7",
        boxShadow: "0 0 0 1px rgba(69, 74, 117, .14)",
      }}
    >
      <div
        style={{
          padding: "44px 60px 36px",
          borderBottom: "2px solid #171A28",
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
              color: "#5B44C9",
              marginBottom: 16,
            }}
          >
            Sistema visual · Midnight Hack BA 2026
          </div>
          <h1 style={{ font: `700 74px/.94 ${SG}`, margin: 0, letterSpacing: "-.05em" }}>
            Phantom<span style={{ color: "#8B6DF0" }}>Verum</span>
          </h1>
          <p
            style={{
              font: `400 18px/1.5 ${SG}`,
              color: "#6E7490",
              margin: "14px 0 0",
              maxWidth: "54ch",
              textWrap: "pretty",
            }}
          >
            Paleta Ethereum, tipografía y recursos gráficos. Referencia para las dos aplicaciones y
            para el deck.
          </p>
        </div>
        <img src="/marca.svg" alt="" style={{ flex: "none", width: 132, display: "block" }} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          borderBottom: "1px solid rgba(69, 74, 117, .16)",
        }}
      >
        <div style={{ padding: "30px 36px 30px 60px", borderRight: "1px solid rgba(69,74,117,.16)" }}>
          <Rotulito>De dónde sale</Rotulito>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              font: `400 15px/1.65 ${SG}`,
              color: "#454A75",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <li>El logo define la paleta: violeta neón sobre gunmetal y navy profundo.</li>
            <li>
              Los neutros y el lila son los de la marca Ethereum — <Cod>#454A75</Cod>,{" "}
              <Cod>#8A92B2</Cod>, <Cod>#C9B3F5</Cod>.
            </li>
            <li>
              El sistema se definió acá porque <Cod>ui/</Cod> arrancó vacío: no había UI previa que
              copiar.
            </li>
          </ul>
        </div>
        <div style={{ padding: "30px 60px 30px 36px" }}>
          <Rotulito>La regla que ordena todo</Rotulito>
          <p
            style={{
              font: `400 15px/1.65 ${SG}`,
              color: "#454A75",
              margin: "0 0 12px",
              textWrap: "pretty",
            }}
          >
            El dual-ledger de Midnight se traduce en <strong>dos aplicaciones separadas</strong>,
            cada una con su propio registro visual.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              font: `400 14px/1.5 ${SG}`,
              color: "#454A75",
            }}
          >
            <div style={{ display: "flex", gap: 11 }}>
              <span style={{ width: 14, height: 14, background: "#14161F", flex: "none", marginTop: 3 }} />
              <span>
                <strong>Cliente</strong> — oscuro. Corre en tu máquina, tiene proof server, guarda
                witnesses.
              </span>
            </div>
            <div style={{ display: "flex", gap: 11 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  background: "#F1F2F7",
                  border: "1.5px solid #171A28",
                  flex: "none",
                  marginTop: 3,
                }}
              />
              <span>
                <strong>Explorer</strong> — claro. Lee la cadena, no tiene proof server, no recibe
                nada privado.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "44px 60px 0" }}>
        <Titulo>Color</Titulo>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            border: "1.5px solid #171A28",
            marginBottom: 10,
          }}
        >
          <Muestra nombre="papel" hex="#F1F2F7" texto="#171A28" />
          <Muestra nombre="campo" hex="#E5E7F0" texto="#171A28" borde />
          <Muestra nombre="tinta" hex="#14161F" texto="#EDEEF5" borde />
          <Muestra nombre="panel" hex="#1D2030" texto="#EDEEF5" borde />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            border: "1.5px solid #171A28",
            marginBottom: 12,
          }}
        >
          <Muestra nombre="violeta" hex="#8B6DF0" texto="#14161F" chica />
          <Muestra nombre="profundo" hex="#5B44C9" texto="#F1F2F7" borde chica />
          <Muestra nombre="lila ETH" hex="#C9B3F5" texto="#14161F" borde chica />
          <Muestra nombre="slate ETH" hex="#454A75" texto="#F1F2F7" borde chica />
          <Muestra nombre="probado" hex="#12876E" texto="#F1F2F7" borde chica />
          <Muestra nombre="rechazo" hex="#C4453A" texto="#F1F2F7" borde chica />
        </div>
        <p
          style={{
            font: `400 14px/1.55 ${SG}`,
            color: "#6E7490",
            margin: "0 0 40px",
            maxWidth: "78ch",
          }}
        >
          Dos fondos como máximo. El <Fuerte c="#5B44C9">violeta</Fuerte> sólo para acción y sellado;
          el <Fuerte c="#12876E">verde</Fuerte> sólo para autoría probada; el{" "}
          <Fuerte c="#C4453A">rojo</Fuerte> sólo para el caso no designado. Nada más lleva color.
        </p>

        <Titulo>Tipografía</Titulo>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: 32,
            borderTop: "1px solid rgba(69,74,117,.18)",
            paddingTop: 24,
            marginBottom: 44,
          }}
        >
          <div>
            <Rotulito>Space Grotesk · display y UI</Rotulito>
            <div style={{ font: `700 56px/1 ${SG}`, letterSpacing: "-.045em" }}>Autoría probada</div>
            <div style={{ font: `500 24px/1.3 ${SG}`, marginTop: 12, letterSpacing: "-.02em" }}>
              Sellar y denunciar
            </div>
            <p style={{ font: `400 14px/1.55 ${SG}`, color: "#6E7490", marginTop: 12 }}>
              700 para veredictos y portada, 600 para títulos de pantalla, 500 para botones y
              labels, 400 para párrafos. Tracking negativo en todo lo grande.
            </p>
          </div>
          <div>
            <Rotulito>IBM Plex Mono · datos</Rotulito>
            <div style={{ font: `500 20px/1.4 ${MONO}`, wordBreak: "break-all" }}>
              0x8f3c9d1e
              <br />
              a41d02b7
            </div>
            <p style={{ font: `400 14px/1.55 ${SG}`, color: "#6E7490", marginTop: 12 }}>
              Todo hash, clave, nullifier y label de sistema. Siempre partible, nunca truncado sin
              elipsis. Mínimo 12 px proyectado.
            </p>
          </div>
        </div>

        <Titulo>Recursos</Titulo>
        <p
          style={{
            font: `400 15px/1.55 ${SG}`,
            color: "#6E7490",
            margin: "0 0 22px",
            maxWidth: "72ch",
          }}
        >
          Tres piezas hacen todo el trabajo semántico del producto.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          <div style={{ border: "1.5px solid #171A28", background: "#14161F", padding: 20 }}>
            <Rotulito color="#C9B3F5">Barra de censura</Rotulito>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {["secret", "evidencia"].map((n) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ font: `500 11px ${MONO}`, color: "#8A92B2", width: 62, flex: "none" }}>
                    {n}
                  </span>
                  <span style={{ flex: 1, height: 15, background: "#C9B3F5" }} />
                </div>
              ))}
            </div>
            <p style={{ font: `400 13px/1.5 ${SG}`, color: "#8A92B2", marginTop: 15, marginBottom: 0 }}>
              Lo privado se muestra <em style={{ color: "#EDEEF5" }}>existiendo</em>, sin mostrarse.
              Lila sobre oscuro, tinta sobre claro.
            </p>
          </div>

          <div
            style={{
              border: "1.5px solid #171A28",
              background: "#FBFBFE",
              padding: 20,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Rotulito color="#5B44C9">Sello octogonal</Rotulito>
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 10px" }}>
              <SelloZK tamano={92} />
            </div>
            <p style={{ font: `400 13px/1.5 ${SG}`, color: "#6E7490", marginTop: "auto", marginBottom: 0 }}>
              La silueta del logo. Aparece una sola vez por pantalla, cuando algo queda sellado
              on-chain.
            </p>
          </div>

          <div
            style={{
              border: "1.5px solid #171A28",
              background: "#FBFBFE",
              padding: 20,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Rotulito color="#5B44C9">La línea violeta</Rotulito>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: 92,
                border: "1px solid rgba(69,74,117,.2)",
              }}
            >
              <div style={{ flex: 1, background: "#14161F" }} />
              <div style={{ height: 3, background: "#8B6DF0", flex: "none" }} />
              <div style={{ flex: 1, background: "#F1F2F7" }} />
            </div>
            <p style={{ font: `400 13px/1.5 ${SG}`, color: "#6E7490", marginTop: 15, marginBottom: 0 }}>
              Marca el borde del header y del terminal en las dos apps. Es el mismo violeta en
              ambas: la única cosa que comparten.
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          margin: "44px 60px 0",
          borderTop: "2px solid #171A28",
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
            }}
          >
            Dos aplicaciones:{" "}
            <a href={URL_CLIENTE} style={{ color: "#5B44C9" }}>
              Cliente
            </a>{" "}
            — denunciar, revelar autoría, emitir credenciales — y{" "}
            <a href={URL_EXPLORER} style={{ color: "#5B44C9" }}>
              Explorer
            </a>{" "}
            — ledger, verificar sello, verificar autoría.
          </div>
        </div>
        <div
          style={{
            flex: "none",
            font: `400 12.5px/1.7 ${MONO}`,
            color: "#8A92B2",
            textAlign: "right",
          }}
        >
          Midnight Hack BA 2026
          <br />
          <span style={{ color: "#5B44C9" }}>UX &amp; Design = 15 %</span>
        </div>
      </div>
    </div>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return (
    <div style={{ font: `600 32px/1 ${SG}`, letterSpacing: "-.035em", marginBottom: 22 }}>
      {children}
    </div>
  );
}

function Rotulito({ children, color = "#8A92B2" }: { children: ReactNode; color?: string }) {
  return (
    <div
      style={{
        font: `600 10px/1 ${MONO}`,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        color,
        marginBottom: 13,
      }}
    >
      {children}
    </div>
  );
}

function Cod({ children }: { children: ReactNode }) {
  return (
    <code style={{ font: `500 13px ${MONO}`, background: "#E5E7F0", padding: "1px 5px" }}>
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
  chica,
}: {
  nombre: string;
  hex: string;
  texto: string;
  borde?: boolean;
  chica?: boolean;
}) {
  return (
    <div
      style={{
        aspectRatio: "1 / .66",
        background: hex,
        display: "flex",
        alignItems: "flex-end",
        padding: chica ? 10 : 11,
        font: `500 ${chica ? 9 : 9.5}px/1.35 ${MONO}`,
        color: texto,
        borderLeft: borde ? "1.5px solid #171A28" : undefined,
      }}
    >
      {nombre}
      <br />
      {hex}
    </div>
  );
}
