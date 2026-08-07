import { Boton } from "@shared/componentes/Boton";
import { Encabezado, LineaFormula, MONO, Rotulo, SG, Tarjeta } from "@shared/componentes/base";
import { URL_EXPLORER } from "@shared/demo";
import { altura, completo, corto } from "@shared/formato";

import { useCliente } from "../estado";

export function Emitir() {
  const e = useCliente();

  return (
    <>
      <Encabezado
        kicker={`Se ejecuta en la máquina de ${e.orgNombre}`}
        derecha="t1 · issuer"
        titulo="Emitir credenciales"
      >
        El directorio de empleados es estado interno de la empresa y nunca se publica. Al ledger va
        únicamente el ancla: la raíz del árbol. El emisor es{" "}
        <strong style={{ color: "var(--pv-text)" }}>mock declarado</strong> — en producción es el
        directorio corporativo que ya existe.
      </Encabezado>

      <Tarjeta
        titulo={`Directorio interno · ${e.hojasEmitidas} de 256 hojas`}
        derecha="nunca sale de acá"
      >
        <div style={{ padding: "4px 20px 16px", display: "flex", flexDirection: "column" }}>
          {e.directorioConHojas.map((emp) => (
            <div
              key={emp.nombre}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "12px 0",
                borderBottom: "1px solid var(--pv-h10)",
              }}
            >
              <span style={{ font: `500 14.5px/1.2 ${SG}`, width: 140, flex: "none" }}>
                {emp.nombre}
              </span>
              <span
                style={{
                  font: `400 12.5px/1.2 ${SG}`,
                  color: "var(--pv-muted)",
                  width: 118,
                  flex: "none",
                }}
              >
                {emp.rol}
              </span>
              <span
                className="pv-hex"
                style={{ font: `500 12.5px/1.2 ${MONO}`, color: "var(--pv-accent)", flex: 1, minWidth: 0 }}
              >
                {corto(emp.hoja, 8)}
              </span>
              <span
                style={{
                  font: `500 10px/1 ${MONO}`,
                  color: e.hojasEmitidas > 0 ? "var(--pv-pos)" : "var(--pv-dim)",
                  flex: "none",
                }}
              >
                {e.hojasEmitidas > 0 ? "✓ emitida" : "pendiente"}
              </span>
            </div>
          ))}
          <div
            style={{ font: `400 13.5px/1.55 ${SG}`, color: "var(--pv-muted)", paddingTop: 14 }}
          >
            Cada hoja es{" "}
            <code style={{ font: `500 12.5px ${MONO}`, color: "var(--pv-accent)" }}>
              H(dom ‖ orgId ‖ credencialSecret)
            </code>
            . Conocer las hojas no le sirve a la empresa: el circuito prueba pertenencia sin revelar
            cuál.
          </div>
        </div>
      </Tarjeta>

      <LineaFormula titulo="Al publicar salen dos campos, y ninguno es una persona">
        orgId &nbsp;{completo(e.orgId)}
        <br />
        ancla &nbsp;{completo(e.ancla)}
      </LineaFormula>

      {!e.orgRegistrada ? (
        <Boton onClick={e.registrarOrg} sub="circuit registerOrganization()">
          Publicar el ancla en el ledger
        </Boton>
      ) : (
        <div
          style={{
            border: "1.5px solid var(--pv-probado)",
            background: "var(--pv-posbg)",
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 11,
          }}
        >
          <Rotulo color="var(--pv-pos)">Ancla publicada · block {altura(e.alturaOrg)}</Rotulo>
          <div
            style={{ font: `400 14.5px/1.6 ${SG}`, color: "var(--pv-muted)", maxWidth: "64ch" }}
          >
            Un segundo registro del mismo{" "}
            <code style={{ font: `500 13px ${MONO}`, color: "var(--pv-text)" }}>orgId</code> falla
            por diseño — es el assert del circuito. Verificalo en el{" "}
            <a href={URL_EXPLORER} target="_blank" rel="noreferrer">
              Explorer
            </a>
            .
          </div>
          <Boton
            variante="fantasma"
            tamano="chico"
            onClick={e.registrarOrg}
            style={{ alignSelf: "flex-start" }}
          >
            probar a registrarla de nuevo
          </Boton>
        </div>
      )}
    </>
  );
}
