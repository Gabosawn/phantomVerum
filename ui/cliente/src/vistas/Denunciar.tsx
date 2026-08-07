import { Boton } from "@shared/componentes/Boton";
import {
  BarraCensura,
  Campo,
  Encabezado,
  LineaFormula,
  MONO,
  PasosProof,
  Rotulo,
  SelloZK,
  SG,
  Tarjeta,
} from "@shared/componentes/base";
import { Dropzone } from "@shared/componentes/Dropzone";
import { URL_EXPLORER } from "@shared/demo";
import { altura, completo, medio, pesoArchivo } from "@shared/formato";

import { useCliente } from "../estado";

export function Denunciar() {
  const e = useCliente();

  return (
    <>
      <Encabezado
        kicker="Se ejecuta en tu computadora"
        derecha="t2 · private state · witness"
        titulo="Denunciar"
      >
        Esta aplicación no tiene servidor. Habla con tu propio proof server en{" "}
        <code style={{ font: `500 14px ${MONO}`, color: "var(--pv-accent)" }}>localhost:6300</code>,
        y lo único que sale de acá es una transacción con dos hashes.
      </Encabezado>

      <Tarjeta titulo="Estado privado en esta máquina" derecha="nada de esto se transmite">
        <div style={{ padding: "6px 20px 14px", display: "flex", flexDirection: "column" }}>
          <BarraCensura
            etiqueta={`credencial ${e.orgNombre}`}
            sub="merkle leaf"
            estado={e.hojasEmitidas > 0 ? "✓ válida" : "sin emitir"}
            estadoColor={e.hojasEmitidas > 0 ? "var(--pv-pos)" : "var(--pv-dim)"}
          />
          <BarraCensura
            etiqueta="secret personal"
            sub={e.identidad.esDemo ? "persistido local" : "rotado en esta sesión"}
            estado="✓ en disco"
          />
          <BarraCensura
            etiqueta="contenido de la evidencia"
            estado="jamás enviado"
            estadoColor="var(--pv-muted)"
            conBorde={false}
          />
        </div>
      </Tarjeta>

      <Tarjeta titulo="1 · Evidencia" derecha="hashing local · SHA-256">
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 15 }}>
          {!e.archivo ? (
            <>
              <Dropzone
                titulo="Arrastrá el archivo o hacé click para elegir"
                sub="el archivo no se sube a ningún lado"
                onArchivo={e.cargarArchivo}
              />
              <button
                type="button"
                className="pv-btn-fantasma"
                onClick={() => e.cargarMuestra("/muestras/contrato-obra-4471.pdf", "contrato-obra-4471.pdf")}
                style={{
                  alignSelf: "flex-start",
                  border: "1px solid var(--pv-h20)",
                  color: "var(--pv-dim)",
                  font: `500 10px/1 ${MONO}`,
                  letterSpacing: ".06em",
                  padding: "7px 10px",
                }}
              >
                usar el expediente de muestra
              </button>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "var(--pv-surface)",
                  border: "1px solid var(--pv-h18)",
                  padding: "13px 15px",
                }}
              >
                <span style={{ font: `500 18px/1 ${MONO}`, color: "var(--pv-violeta)", flex: "none" }}>
                  ▤
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ font: `500 14.5px/1.3 ${SG}`, display: "block" }}>
                    {e.archivo.nombre}
                  </span>
                  <span style={{ font: `400 11px/1.4 ${MONO}`, color: "var(--pv-muted)" }}>
                    {pesoArchivo(e.archivo.tamano)} · nunca salió de esta máquina
                  </span>
                </span>
                <Boton variante="fantasma" tamano="chico" onClick={e.quitarArchivo}>
                  quitar
                </Boton>
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span
                  style={{
                    font: `500 10px/1.5 ${MONO}`,
                    color: "var(--pv-muted)",
                    flex: "none",
                    width: 104,
                    letterSpacing: ".04em",
                  }}
                >
                  evidenciaHash
                  <br />
                  <span style={{ color: "var(--pv-dim)" }}>→ al circuito</span>
                </span>
                <span
                  className="pv-hex"
                  style={{ font: `500 13.5px/1.5 ${MONO}`, color: "var(--pv-accent)", flex: 1 }}
                >
                  {completo(e.archivo.hash)}
                </span>
              </div>
            </div>
          )}
        </div>
      </Tarjeta>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Tarjeta style={{ padding: "17px 19px" }}>
          <Rotulo style={{ display: "block", marginBottom: 10 }}>2 · Organización</Rotulo>
          <div style={{ font: `500 18px/1.2 ${SG}` }}>{e.orgNombre}</div>
          <div
            className="pv-hex"
            style={{ font: `400 11px/1.4 ${MONO}`, color: "var(--pv-muted)", marginTop: 6 }}
          >
            orgId {medio(e.orgId)}
          </div>
        </Tarjeta>
        <Tarjeta style={{ padding: "17px 19px" }}>
          <Rotulo style={{ display: "block", marginBottom: 10 }}>3 · Período</Rotulo>
          <div style={{ font: `500 18px/1.2 ${SG}` }}>{e.periodo}</div>
          <div style={{ font: `400 11px/1.4 ${SG}`, color: "var(--pv-muted)", marginTop: 6 }}>
            grueso a propósito: dificulta correlacionar por timing
          </div>
        </Tarjeta>
      </div>

      {e.faseDenuncia === "idle" && (
        <>
          <LineaFormula titulo="Al firmar salen de esta máquina exactamente dos valores">
            denunciaId = H(evidenciaHash ‖ secretPersonal)
            <br />
            nullifier &nbsp;= H(credencialSecret ‖ orgId ‖ periodo)
          </LineaFormula>
          <Boton
            onClick={e.denunciar}
            disabled={!e.archivo || e.hojasEmitidas === 0}
            sub="circuit report()"
            title={
              e.hojasEmitidas === 0
                ? "Primero emití las credenciales en la vista Emitir credenciales (T1)"
                : !e.archivo
                  ? "Cargá la evidencia"
                  : undefined
            }
          >
            Sellar y denunciar
          </Boton>
        </>
      )}

      {e.faseDenuncia === "probando" && (
        <PasosProof titulo="Generando prueba · proof server local" pasos={e.pasosDenuncia} />
      )}

      {e.faseDenuncia === "listo" && e.denuncia && (
        <>
          <div
            style={{ border: "2px solid var(--pv-violeta)", background: "var(--pv-card)", position: "relative" }}
          >
            <div
              style={{
                padding: "12px 22px",
                borderBottom: "1px solid var(--pv-h20)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Rotulo>Denuncia sellada</Rotulo>
              <span style={{ font: `500 10px/1 ${MONO}`, color: "var(--pv-pos)" }}>
                ✓ confirmada en block {altura(e.denuncia.bloque)}
              </span>
            </div>
            <div
              style={{
                padding: "24px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 17,
                paddingRight: 124,
              }}
            >
              <Campo etiqueta="denunciaId" valor={completo(e.denuncia.denunciaId)} tamano={17} />
              <Campo etiqueta="nullifier" valor={completo(e.denuncia.nullifier)} tamano={17} />
              <div style={{ height: 1, background: "var(--pv-h16)" }} />
              <div
                className="pv-hex"
                style={{ font: `500 12.5px/1.6 ${MONO}`, color: "var(--pv-muted)" }}
              >
                tx {medio(e.denuncia.txId)}
                <br />
                0.0031 tDUST ·{" "}
                <span style={{ color: "var(--pv-pos)" }}>shielded, sin dirección visible</span>
                <br />
                <a href={URL_EXPLORER} target="_blank" rel="noreferrer">
                  verla en el Explorer ↗
                </a>
              </div>
            </div>
            <div style={{ position: "absolute", right: 22, bottom: 22 }}>
              <SelloZK />
            </div>
          </div>

          <Tarjeta
            style={{ border: "1.5px solid var(--pv-accent)", padding: 22 }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
                <Rotulo color="var(--pv-accent)">Guardá tu llave de autoría</Rotulo>
                <span style={{ font: `500 10px/1 ${MONO}`, color: "var(--pv-muted)" }}>
                  authorship key
                </span>
              </div>
              <p
                style={{
                  font: `400 15px/1.6 ${SG}`,
                  color: "var(--pv-muted)",
                  margin: 0,
                  maxWidth: "64ch",
                }}
              >
                Sin este archivo{" "}
                <strong style={{ color: "var(--pv-text)" }}>no podés probar autoría nunca más</strong>.
                Contiene tu secret y el hash de la evidencia — los dos witnesses de{" "}
                <code style={{ font: `500 13px ${MONO}`, color: "var(--pv-accent)" }}>
                  revealAuthorship
                </code>
                .
              </p>
              {!e.llaveGuardada ? (
                <Boton variante="tinta" tamano="medio" onClick={e.guardarLlave}>
                  ↓ Descargar phantomverum-autoria.key
                </Boton>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    border: "1px solid var(--pv-probado)",
                    padding: "13px 15px",
                    background: "var(--pv-surface)",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ color: "var(--pv-pos)", font: `500 15px/1 ${MONO}` }}>✓</span>
                  <span style={{ font: `500 13.5px/1.4 ${SG}`, flex: 1 }}>
                    llave guardada en disco
                  </span>
                  <Boton
                    variante="fantasma"
                    tamano="chico"
                    onClick={() => e.setRuta("revelar")}
                    style={{ borderColor: "var(--pv-h30)", color: "var(--pv-accent)" }}
                  >
                    ir a revelar autoría →
                  </Boton>
                </div>
              )}
            </div>
          </Tarjeta>
        </>
      )}
    </>
  );
}
