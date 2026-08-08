import { Boton, Opcion } from "@shared/componentes/Boton";
import {
  BarraCensura,
  Encabezado,
  LineaFormula,
  MONO,
  PasosProof,
  Rastro,
  Rotulo,
  SG,
  Tarjeta,
} from "@shared/componentes/base";
import { Dropzone } from "@shared/componentes/Dropzone";
import { Termino } from "@shared/componentes/Guia";
import { URL_EXPLORER } from "@shared/demo";
import { altura, completo, corto, medio } from "@shared/formato";

import { useCliente } from "../estado";

export function Revelar() {
  const e = useCliente();

  return (
    <>
      <Encabezado
        kicker="Paso 4 · meses después, en tu computadora"
        derecha="t4 · revealAuthorship"
        titulo="Revelar autoría"
      >
        Decidís aparecer ante <em style={{ color: "var(--pv-text)", fontStyle: "normal" }}>una</em>{" "}
        autoridad, la que vos elijas. La prueba queda ligada a su clave pública —{" "}
        <Termino clave="designated verifier">uno por destinatario</Termino> —, así que quien la
        intercepte y verifique con su propia clave no encuentra el registro. Una vez que la
        entregás, en cambio, quien la recibe puede reenviarla: es verificable por cualquiera.
      </Encabezado>

      <Tarjeta titulo="1 · Tu llave de autoría">
        <div style={{ padding: "18px 20px" }}>
          {!e.llave ? (
            <Dropzone
              titulo="Cargar phantom-trace-autoria.key"
              sub="el que descargaste al denunciar"
              accept=".key,application/json"
              onArchivo={e.cargarLlave}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <BarraCensura etiqueta="secret" ancho={120} conBorde={false} />
              <BarraCensura etiqueta="evidenciaHash" ancho={120} conBorde={false} />
              <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                <span
                  style={{
                    font: `500 11px/1.4 ${MONO}`,
                    color: "var(--pv-muted)",
                    width: 120,
                    flex: "none",
                  }}
                >
                  denunciaId
                </span>
                <span className="pv-hex" style={{ font: `500 13px/1.4 ${MONO}`, flex: 1 }}>
                  {completo(e.llave.denunciaId)}
                </span>
              </div>
            </div>
          )}
        </div>
      </Tarjeta>

      <Tarjeta titulo="2 · ¿Ante quién?" derecha="designated verifier">
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 11 }}>
          {e.verificadores.map((v) => (
            <Opcion
              key={v.id}
              seleccionada={v.id === e.verificador.id}
              onClick={() => e.setVerificadorId(v.id)}
              titulo={v.nombre}
              sub={`fiscalPk ${corto(v.pk, 6)}`}
            />
          ))}
        </div>
      </Tarjeta>

      {e.faseRevelar === "idle" && (
        <>
          <LineaFormula titulo="Al firmar sale un solo hash más">
            autoriaHash = H(secret ‖ denunciaId ‖ fiscalPk)
          </LineaFormula>
          <Boton
            onClick={e.revelar}
            disabled={!e.llave}
            sub="circuit revealAuthorship()"
            title={!e.llave ? "Cargá primero tu llave de autoría" : undefined}
          >
            Generar prueba de autoría
          </Boton>
        </>
      )}

      {e.faseRevelar === "probando" && (
        <PasosProof titulo="Generando prueba · proof server local" pasos={e.pasosRevelar} />
      )}

      {e.faseRevelar === "listo" && e.autoria && (
        <div
          style={{
            border: "2px solid var(--pv-probado)",
            background: "var(--pv-posbg)",
            padding: "26px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <Rotulo color="var(--pv-pos)" tracking=".16em">
            Prueba generada · designada a {e.verificador.nombre}
          </Rotulo>
          <Rastro estado="revelado" ancho={200} alto={64} />
          <div
            style={{
              font: `600 clamp(24px, 2.6vw, 34px)/1.15 ${SG}`,
              letterSpacing: "-.03em",
              maxWidth: "24ch",
            }}
          >
            Solo esa clave puede verificarla
          </div>
          <div
            className="pv-hex"
            style={{
              font: `500 13px/1.9 ${MONO}`,
              color: "var(--pv-muted)",
              borderTop: "1px solid var(--pv-h18)",
              paddingTop: 16,
            }}
          >
            autoriaHash
            <br />
            <span style={{ color: "var(--pv-pos)" }}>{completo(e.autoria.autoriaHash)}</span>
            <br />
            publicado en ledger.authorships · block {altura(e.autoria.bloque)}
          </div>
          <p style={{ font: `400 15px/1.6 ${SG}`, color: "var(--pv-muted)", margin: 0, maxWidth: "60ch" }}>
            Mandale el material por fuera de la cadena — mail, USB, en mano. Lo verifica en el{" "}
            <a href={URL_EXPLORER} target="_blank" rel="noreferrer">
              Explorer
            </a>{" "}
            con su propia clave.
          </p>
          <Boton variante="tinta" tamano="medio" onClick={e.copiarMaterial}>
            {e.copiado ? "✓ material copiado al portapapeles" : "Copiar material para el verificador"}
          </Boton>
          {e.copiado && (
            <p style={{ font: `400 13px/1.55 ${SG}`, color: "var(--pv-muted)", margin: 0 }}>
              Pegalo en el Explorer, en <strong>Verificar autoría → Material recibido</strong>. Es el
              único puente entre las dos aplicaciones: no comparten nada más.
            </p>
          )}
        </div>
      )}

      {e.material && (
        <div
          style={{
            borderTop: "1px solid var(--pv-h22)",
            paddingTop: 18,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <Rotulo color="var(--pv-dim)">Lo que le entregás al verificador</Rotulo>
          <pre
            className="pv-hex"
            style={{
              font: `400 11.5px/1.7 ${MONO}`,
              color: "var(--pv-muted)",
              background: "var(--pv-sunken)",
              border: "1px solid var(--pv-h12)",
              padding: "12px 14px",
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {JSON.stringify(e.material, null, 2)}
          </pre>
          <p style={{ font: `400 13px/1.55 ${SG}`, color: "var(--pv-dim)", margin: 0, maxWidth: "66ch" }}>
            El material incluye una prueba ZK del circuito <code>proveAuthorship</code> que demuestra
            la relación sin revelar tu identidad. Tu <code>secret</code> nunca sale de esta máquina.
          </p>
        </div>
      )}
    </>
  );
}
