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
              sub={`fiscalPk ${corto(c.pk, 6)} · ${c.nota}`}
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
              proof(<Tachado>secret</Tachado>, denunciaId, fiscalPk) = autoriaHash
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
          material, no prueba nada.
        </PanelVeredicto>
      )}

      {e.veredictoAutoria === "parcial" && e.material && (
        <PanelVeredicto
          tono="parcial"
          rotulo="No verificable en este build"
          titulo="Los registros están en la cadena. El vínculo con el autor, no."
          formula={
            <>
              denunciaId ∈ ledger.denuncias ✓
              <br />
              autoriaHash ∈ ledger.autorias ✓ · designada a su clave ✓
              <br />
              proof verificada contra la verifier key — no disponible
            </>
          }
          pie={
            <>
              <div>
                lo que sí está probado
                <br />
                que estos dos registros existen y son públicos
              </div>
              <div>
                lo que falta
                <br />
                la proof ZK de proveAuthorship
              </div>
            </>
          }
        >
          La denuncia está sellada y hay una autoría publicada para su clave. Pero el sobre trae
          la <code style={{ font: `500 14px ${MONO}` }}>proof</code> como copia del{" "}
          <code style={{ font: `500 14px ${MONO}` }}>autoriaHash</code>, y los dos campos los
          aporta quien se lo entregó: cualquiera que haya leído esos dos valores del ledger
          público —el Departamento Legal de {e.orgNombre}, sin ir más lejos— pudo armar un sobre
          idéntico a este. Por eso acá no dice “probada”. Establecer la autoría exige verificar
          la prueba ZK contra la verifier key del circuito.
        </PanelVeredicto>
      )}

      {e.veredictoAutoria === "fail" && e.material && (
        <PanelVeredicto
          tono="rechazo"
          rotulo="No verifica"
          titulo="Esta prueba no fue designada a su clave"
          formula={
            <>
              proof(<Tachado>secret</Tachado>, denunciaId, fiscalPk) ≠ autoriaHash
              <br />∉ ledger.autorias ✗
            </>
          }
          remate="Solo él, solo ante quien él elija."
        >
          Mismo <code style={{ font: `500 14px ${MONO}` }}>denunciaId</code>, mismo material, otra
          clave pública: no prueba nada. La autoría quedó ligada a la clave que el denunciante
          eligió — y no es transferible.
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
