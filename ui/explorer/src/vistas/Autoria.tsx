import { Boton, Opcion } from "@shared/componentes/Boton";
import { BarraCensura, Encabezado, MONO, Rotulo, SG, Tarjeta } from "@shared/componentes/base";
import { PanelVeredicto, Tachado } from "@shared/componentes/PanelVeredicto";
import { altura, corto } from "@shared/formato";

import { useExplorer } from "../estado";
import { FaltaMaterial, MaterialRecibido } from "../MaterialRecibido";

export function Autoria() {
  const e = useExplorer();

  return (
    <>
      <Encabezado
        kicker="Escritorio del verificador"
        kickerColor="var(--pv-text)"
        derecha="t4 · designated verifier"
        titulo="Verificar autoría"
      >
        Alguien te hizo llegar un material off-chain reclamando ser el autor de una denuncia.
        Pegalo acá y verificá con tu propia clave.
      </Encabezado>

      <MaterialRecibido titulo="1 · Material recibido" />
      {!e.material && <FaltaMaterial que="Verificar autoría" />}

      <Tarjeta
        variante="dura"
        titulo={
          <>
            2 · Tu clave <span style={{ color: "var(--pv-accent)" }}>— cambiala y mirá qué pasa</span>
          </>
        }
      >
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 11 }}>
          {e.claves.map((c) => (
            <Opcion
              key={c.id}
              seleccionada={c.id === e.clave.id}
              onClick={() => e.elegirClave(c.id)}
              titulo={
                c.intruso ? (
                  <>
                    {c.nombre}{" "}
                    <span style={{ color: "var(--pv-neg)" }}>(interceptó la prueba)</span>
                  </>
                ) : (
                  c.nombre
                )
              }
              sub={`nonce ${corto(c.nonce, 6)} · ${c.nota}`}
            />
          ))}
          <Boton
            variante="tinta"
            tamano="medio"
            onClick={e.verificarAutoria}
            disabled={!e.material}
            style={{ padding: "18px 20px", font: `600 17px/1 ${SG}`, marginTop: 4 }}
          >
            Verificar contra ledger.autorias
          </Boton>
        </div>
      </Tarjeta>

      {e.veredictoAutoria === "ok" && e.material && (
        <PanelVeredicto
          tono="probado"
          rotulo="Autoría probada"
          titulo="Probada ante usted, y solo ante usted"
          formula={
            <>
              receiptOf(denunciaId, <strong>su</strong> nonce) = recibo
              <br />∈ ledger.autorias ✓
            </>
          }
          pie={
            <>
              <div>
                sellada
                <br />
                block {altura(1_284_924)} · {e.periodo}
              </div>
              <div>
                habilita
                <br />
                protección legal · recompensa SEC 10–30 %
              </div>
            </>
          }
        >
          La persona que escribió esta denuncia le está probando su autoría, sin revelarle su
          identidad ni la evidencia. Si el Departamento Legal de {e.orgNombre} intercepta este mismo
          material y verifica con su propia clave, no encuentra el registro: la autoría se publicó
          una vez, para la clave de usted. Lo que sí puede hacer usted es reenviarlo — la prueba es
          públicamente verificable, así que no es intransferible una vez entregada.
        </PanelVeredicto>
      )}

      {e.veredictoAutoria === "fail" && e.material && (
        <PanelVeredicto
          tono="rechazo"
          rotulo="No verifica"
          titulo="Esta prueba no fue designada a su clave"
          formula={
            <>
              receiptOf(denunciaId, <strong>su</strong> nonce) ≠ recibo
              <br />∉ ledger.autorias ✗
            </>
          }
          remate="Solo él, solo ante quien él elija."
        >
          Mismo <code style={{ font: `500 14px ${MONO}` }}>denunciaId</code>, mismo material, otro
          nonce: al recomputar sale un recibo distinto, y ese no está publicado en ninguna parte.
          No es que el sistema se niegue a mostrárselo — es que ese valor nunca existió.
        </PanelVeredicto>
      )}

      {/*
        El .dc.html listaba acá "el secret del autor" entre lo que el verificador
        recibe. Ya no es cierto: el export v2 no lo lleva. El verificador compara
        el `autoriaHash` que viene en el sobre contra el que está en la cadena y
        contra su propia clave; el secret se queda en la máquina del denunciante
        (circuito `proveAuthorship`, docs/03-plan-ejecucion.md §3.2).
        Lo que el verificador efectivamente NO ve es lo de abajo.
      */}
      <div
        style={{
          borderTop: "1px solid var(--pv-h22)",
          paddingTop: 20,
          display: "flex",
          flexDirection: "column",
          gap: 11,
        }}
      >
        <Rotulo color="var(--pv-dim)" style={{ marginBottom: 3 }}>
          Lo que el verificador nunca ve
        </Rotulo>
        <BarraCensura
          etiqueta="la evidencia cruda"
          ancho={150}
          color="var(--pv-text)"
          conBorde={false}
        />
        <BarraCensura
          etiqueta="quién es el autor"
          ancho={150}
          color="var(--pv-text)"
          conBorde={false}
        />
        <div
          style={{ font: `400 13px/1.55 ${SG}`, color: "var(--pv-dim)", marginTop: 4, maxWidth: "70ch" }}
        >
          La proof ZK que recibiste demuestra que el autor conoce el <code>secret</code> sin
          revelártelo. El circuito <code>proveAuthorship</code> garantiza la relación
          criptográfica entre <code>denunciaId</code>, <code>evidenciaHash</code> y{" "}
          <code>autoriaHash</code>.
        </div>
      </div>
    </>
  );
}
