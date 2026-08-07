import { MONO, Rotulo, SG, Tarjeta } from "@shared/componentes/base";
import { URL_CLIENTE } from "@shared/demo";
import { completo, corto } from "@shared/formato";

import { useExplorer } from "./estado";

/**
 * El único puente entre las dos aplicaciones: un campo de texto.
 *
 * El denunciante copia el material en el Cliente y lo pega acá. No hay API
 * entre las dos apps, no hay estado compartido, no hay sesión — exactamente
 * como cuando alguien te manda un sobre. Corren en puertos distintos, así que
 * ni siquiera comparten `localStorage`.
 */
export function MaterialRecibido({ titulo }: { titulo: string }) {
  const e = useExplorer();

  return (
    <Tarjeta variante="dura" titulo={titulo} derecha="off-chain">
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <textarea
          value={e.materialCrudo}
          onChange={(ev) => e.pegarMaterial(ev.target.value)}
          spellCheck={false}
          rows={e.material ? 3 : 5}
          placeholder={`Pegá acá el JSON que te entregó el denunciante.\n\nLo copia con el botón "Copiar material para el verificador"\ndel Cliente (${URL_CLIENTE}), después de revelar autoría.`}
          style={{
            font: `400 12px/1.6 ${MONO}`,
            color: "var(--pv-text)",
            background: "var(--pv-sunken)",
            border: `1px solid ${e.errorMaterial ? "var(--pv-neg)" : "var(--pv-h18)"}`,
            padding: "11px 13px",
            resize: "vertical",
            width: "100%",
            boxSizing: "border-box",
          }}
        />

        {e.errorMaterial && (
          <div style={{ font: `500 12.5px/1.5 ${MONO}`, color: "var(--pv-neg)" }}>
            ✗ {e.errorMaterial}
          </div>
        )}

        {e.material && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Dato etiqueta="denunciaId reclamado" valor={completo(e.material.denunciaId)} />
            <Dato etiqueta="hash de autoría a verificar" valor={completo(e.material.autoriaHash)} />
            <Dato
              etiqueta="secret del autor"
              valor={`${corto(e.material.secret, 6)} — recibido`}
              atenuado
            />
            <Dato
              etiqueta="hash de la evidencia"
              valor={`${corto(e.material.evidenciaHash, 6)} — recibido`}
              atenuado
            />
          </div>
        )}
      </div>
    </Tarjeta>
  );
}

function Dato({
  etiqueta,
  valor,
  atenuado,
}: {
  etiqueta: string;
  valor: string;
  atenuado?: boolean;
}) {
  return (
    <div>
      <Rotulo color="var(--pv-dim)" tracking=".1em" style={{ display: "block", marginBottom: 7 }}>
        {etiqueta}
      </Rotulo>
      <div
        className="pv-hex"
        style={{
          font: `500 12.5px/1.4 ${MONO}`,
          color: atenuado ? "var(--pv-muted)" : "var(--pv-text)",
          background: "var(--pv-sunken)",
          padding: "9px 11px",
          border: "1px solid var(--pv-h18)",
        }}
      >
        {valor}
      </div>
    </div>
  );
}

/** Aviso reutilizable para cuando falta el material. */
export function FaltaMaterial({ que }: { que: string }) {
  return (
    <div
      style={{
        borderLeft: "2px solid var(--pv-h30)",
        paddingLeft: 14,
        font: `400 13.5px/1.6 ${SG}`,
        color: "var(--pv-muted)",
        maxWidth: "64ch",
      }}
    >
      {que} necesita el material del denunciante. Sin su <code>secret</code>, el valor sellado en la
      cadena no se puede reproducir — ni por vos, ni por la empresa, ni por nadie. Eso no es una
      limitación de esta pantalla: es lo que hace que el sello sirva.
    </div>
  );
}
