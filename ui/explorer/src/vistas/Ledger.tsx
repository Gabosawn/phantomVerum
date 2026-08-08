import { Encabezado, MONO, Rotulo, SG, Tarjeta } from "@shared/componentes/base";
import { ANCLA } from "@shared/demo";
import { altura, completo, corto } from "@shared/formato";

import { useExplorer } from "../estado";

export function Ledger() {
  const e = useExplorer();

  return (
    <>
      <Encabezado
        kicker="Cualquiera puede abrir esto"
        kickerColor="var(--pv-text)"
        derecha="midnight preview · read only"
        titulo="El ledger"
      >
        Este explorador no tiene proof server ni witnesses: no hay nada privado que procesar. Es
        todo lo que existe públicamente, y es lo mismo que ve {e.orgNombre}.
      </Encabezado>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 22,
          flexWrap: "wrap",
          borderTop: "1px solid var(--pv-h22)",
          borderBottom: "1px solid var(--pv-h22)",
          padding: "22px 0",
        }}
      >
        <Cifra valor={String(e.denuncias.length)} pie={["denuncias", "en el período"]} />
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--pv-h22)" }} />
        <Cifra valor="0" color="var(--pv-accent)" pie={["atribuibles a", "una persona"]} />
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--pv-h22)" }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div
            style={{
              font: `400 clamp(16px, 1.7vw, 19px)/1.45 ${SG}`,
              color: "var(--pv-muted)",
              textWrap: "pretty",
            }}
          >
            Podés leerlo todo el día. No hay nada que correlacionar.
          </div>
        </div>
      </div>

      <Tarjeta variante="dura" titulo="ledger.denuncias" derecha={`período ${e.periodo}`}>
        <div
          style={{
            display: "flex",
            gap: 12,
            padding: "9px 18px",
            borderBottom: "1px solid var(--pv-h18)",
            font: `600 9.5px/1 ${MONO}`,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--pv-dim)",
          }}
        >
          <span style={{ width: 130, flex: "none" }}>denunciaId</span>
          <span style={{ width: 110, flex: "none" }}>nullifier</span>
          <span style={{ flex: 1, minWidth: 60 }}>autor</span>
          <span style={{ width: 68, flex: "none" }}>block</span>
        </div>

        {e.denuncias.map((d) => (
          <div
            key={d.denunciaId}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "13px 18px",
              borderBottom: "1px solid var(--pv-h12)",
            }}
          >
            <span
              className="pv-hex"
              style={{ width: 130, flex: "none", font: `500 11.5px/1.3 ${MONO}` }}
            >
              {corto(d.denunciaId, 6)}
            </span>
            <span
              className="pv-hex"
              style={{
                width: 110,
                flex: "none",
                font: `500 11.5px/1.3 ${MONO}`,
                color: "var(--pv-muted)",
              }}
            >
              {corto(d.nullifier, 5)}
            </span>
            <span style={{ flex: 1, height: 16, background: "var(--pv-text)", minWidth: 60 }} />
            <span
              style={{
                width: 68,
                flex: "none",
                font: `500 10.5px/1 ${MONO}`,
                color: "var(--pv-dim)",
              }}
            >
              {altura(d.bloque)}
            </span>
          </div>
        ))}

        <div style={{ padding: "13px 18px", font: `400 13.5px/1.55 ${SG}`, color: "var(--pv-muted)" }}>
          La columna <em>autor</em> no está censurada por la interfaz: <strong>no existe</strong>.
          Una transacción de Midnight no tiene{" "}
          <code style={{ font: `500 12.5px ${MONO}` }}>msg.sender</code>.
        </div>
      </Tarjeta>

      <Tarjeta variante="dura" titulo="ledger.organizaciones">
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <Rotulo color="var(--pv-dim)" tracking=".1em" style={{ display: "block", marginBottom: 6 }}>
              orgId
            </Rotulo>
            <div className="pv-hex" style={{ font: `500 13px/1.4 ${MONO}` }}>
              {completo(e.orgId)}
            </div>
          </div>
          <div>
            <Rotulo color="var(--pv-dim)" tracking=".1em" style={{ display: "block", marginBottom: 6 }}>
              ancla · merkle root, depth 16
            </Rotulo>
            <div className="pv-hex" style={{ font: `500 13px/1.4 ${MONO}` }}>
              {completo(ANCLA)}
            </div>
          </div>
        </div>
      </Tarjeta>

      <div style={{ borderTop: "1px solid var(--pv-h22)", paddingTop: 20 }}>
        <Rotulo color="var(--pv-dim)" style={{ display: "block", marginBottom: 14 }}>
          Lo que un adversario intentaría desde acá, y no puede
        </Rotulo>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 11,
            font: `400 14.5px/1.55 ${SG}`,
            color: "var(--pv-text2)",
          }}
        >
          <Intento>
            Mirar el <code style={{ font: `500 12.5px ${MONO}` }}>msg.sender</code> — no existe en el
            formato de transacción de Midnight.
          </Intento>
          <Intento>
            Rastrear quién pagó el fee — se paga en tDUST <em>shielded</em>, con commitment y
            nullifier.
          </Intento>
          <Intento>Cruzar nullifiers entre períodos — no son linkeables.</Intento>
          <Intento>
            Saber a qué documento corresponde una denuncia — el hash de la evidencia no se publica,
            sólo <code style={{ font: `500 12.5px ${MONO}` }}>H(dom ‖ evidenciaHash ‖ secret)</code>.
          </Intento>
          <Intento tono="aviso">
            Sí puede correlacionar timing o mirar el indexer (IP, viewing key). Límite real,
            declarado.
          </Intento>
        </div>
      </div>
    </>
  );
}

function Cifra({
  valor,
  pie,
  color,
}: {
  valor: string;
  pie: [string, string];
  color?: string;
}) {
  return (
    <div>
      <div
        style={{
          font: `700 clamp(38px, 4.4vw, 58px)/.9 ${SG}`,
          letterSpacing: "-.04em",
          color,
        }}
      >
        {valor}
      </div>
      <div
        style={{
          font: `500 10px/1.3 ${MONO}`,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--pv-dim)",
          marginTop: 8,
        }}
      >
        {pie[0]}
        <br />
        {pie[1]}
      </div>
    </div>
  );
}

function Intento({
  children,
  tono = "imposible",
}: {
  children: React.ReactNode;
  tono?: "imposible" | "aviso";
}) {
  const aviso = tono === "aviso";
  return (
    <div style={{ display: "flex", gap: 12, color: aviso ? "var(--pv-dim)" : undefined }}>
      <span
        style={{
          color: aviso ? "var(--pv-dim)" : "var(--pv-neg)",
          font: `500 13px/1.5 ${MONO}`,
          flex: "none",
        }}
      >
        {aviso ? "⚠" : "✗"}
      </span>
      <span>{children}</span>
    </div>
  );
}
