import { Boton, Opcion } from "@shared/componentes/Boton";
import { Encabezado, MONO, SG, Tarjeta } from "@shared/componentes/base";
import { Dropzone } from "@shared/componentes/Dropzone";
import { PanelVeredicto, Tachado } from "@shared/componentes/PanelVeredicto";
import { MUESTRA_ALTERADA, MUESTRA_ORIGINAL } from "@shared/demo";
import { completo, corto, pesoArchivo } from "@shared/formato";

import { useExplorer } from "../estado";
import { FaltaMaterial, MaterialRecibido } from "../MaterialRecibido";

export function Sello() {
  const e = useExplorer();

  return (
    <>
      <Encabezado
        kicker="Verificación de integridad"
        kickerColor="var(--pv-text)"
        derecha="t3 · cualquiera puede correrla"
        titulo={
          <>
            ¿Es <em style={{ color: "var(--pv-accent)" }}>esta</em> la evidencia que se selló?
          </>
        }
      >
        {e.orgNombre} aparece con una versión del documento y dice que es la original. La comparación
        es aritmética, no de palabra: si cambió un byte, el hash no reproduce el{" "}
        <code style={{ font: `500 14px ${MONO}` }}>denunciaId</code> que está en la cadena.
      </Encabezado>

      <MaterialRecibido titulo="1 · Material del denunciante" />
      {!e.material && <FaltaMaterial que="Verificar el sello" />}

      <Tarjeta variante="dura" titulo="2 · Documento presentado">
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 13 }}>
          <Opcion
            seleccionada={e.documento?.nombre === MUESTRA_ORIGINAL.nombre}
            onClick={() => e.cargarMuestra(MUESTRA_ORIGINAL.ruta, MUESTRA_ORIGINAL.nombre)}
            icono={
              <span style={{ font: `500 18px/1 ${MONO}`, color: "var(--pv-muted)", flex: "none" }}>
                ▤
              </span>
            }
            titulo={MUESTRA_ORIGINAL.nombre}
            sub={MUESTRA_ORIGINAL.descripcion}
          />
          <Opcion
            seleccionada={e.documento?.nombre === MUESTRA_ALTERADA.nombre}
            onClick={() => e.cargarMuestra(MUESTRA_ALTERADA.ruta, MUESTRA_ALTERADA.nombre)}
            icono={
              <span style={{ font: `500 18px/1 ${MONO}`, color: "var(--pv-neg)", flex: "none" }}>
                ▤
              </span>
            }
            titulo={
              <>
                contrato-obra-4471{" "}
                <span style={{ color: "var(--pv-neg)" }}>(rev-legal).pdf</span>
              </>
            }
            sub={MUESTRA_ALTERADA.descripcion}
          />

          <Dropzone
            titulo="…o arrastrá cualquier otro archivo"
            sub="se hashea acá; probalo con lo que quieras"
            onArchivo={e.cargarDocumento}
          />

          {e.documento && (
            <div
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                borderTop: "1px solid var(--pv-h18)",
                paddingTop: 14,
              }}
            >
              <span
                style={{
                  font: `500 10px/1.5 ${MONO}`,
                  color: "var(--pv-dim)",
                  flex: "none",
                  width: 112,
                  letterSpacing: ".04em",
                }}
              >
                hash del archivo
                <br />
                presentado
              </span>
              <span className="pv-hex" style={{ font: `500 13.5px/1.5 ${MONO}`, flex: 1 }}>
                {completo(e.documento.hash)}
                <br />
                <span style={{ color: "var(--pv-dim)" }}>
                  {e.documento.nombre} · {pesoArchivo(e.documento.tamano)}
                </span>
              </span>
            </div>
          )}

          <Boton
            variante="tinta"
            tamano="medio"
            onClick={e.verificarSello}
            disabled={!e.documento || !e.material}
            style={{ padding: "18px 20px", font: `600 17px/1 ${SG}` }}
          >
            Comparar contra el ledger
          </Boton>
        </div>
      </Tarjeta>

      {e.veredictoSello === "ok" && e.documento && (
        <PanelVeredicto
          tono="probado"
          rotulo="Veredicto"
          titulo="Evidencia íntegra"
          formula={
            <>
              H({corto(e.documento.hash, 4)} ‖ <Tachado>secret</Tachado>) ={" "}
              {corto(e.selloRecomputado, 4)}
              <br />∈ ledger.denuncias ✓
            </>
          }
        >
          El hash del documento presentado, combinado con el secret del autor, reproduce exactamente
          el <code style={{ font: `500 14px ${MONO}` }}>denunciaId</code> sellado en el ledger.
        </PanelVeredicto>
      )}

      {e.veredictoSello === "fail" && e.documento && (
        <PanelVeredicto
          tono="rechazo"
          rotulo="Veredicto"
          titulo="Documento alterado"
          formula={
            <>
              H({corto(e.documento.hash, 4)} ‖ <Tachado>secret</Tachado>) ={" "}
              {corto(e.selloRecomputado, 4)}
              <br />∉ ledger.denuncias ✗
            </>
          }
        >
          Este archivo no es el que se selló. No hay discusión de credibilidad: el hash no está en la
          cadena, y nadie puede fabricar uno que sí lo esté sin el secret del autor.
        </PanelVeredicto>
      )}

      <div
        style={{
          font: `400 13.5px/1.6 ${SG}`,
          color: "var(--pv-muted)",
          borderLeft: "2px solid var(--pv-h30)",
          paddingLeft: 14,
          maxWidth: "62ch",
        }}
      >
        Honestidad para el Q&amp;A: PhantomVerum no prueba que el contenido sea <em>verdadero</em>.
        Prueba que viene de adentro y que <strong>nadie lo tocó después</strong>. La veracidad la
        evalúa el fiscal, como siempre.
      </div>
    </>
  );
}
