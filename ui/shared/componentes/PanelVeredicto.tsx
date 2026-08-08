import type { ReactNode } from "react";
import { MONO, SG } from "./base";

const PAPEL = "#F2F3F8";

/**
 * El veredicto. Panel sólido a todo el ancho, sin decoración.
 *
 * En el video el remate es cambiar la clave en el Explorer y ver el MISMO
 * material cambiar de veredicto, así que esto tiene que leerse desde el fondo
 * de la sala y en un segundo. Por eso ocupa todo y no tiene bordes ni íconos
 * que compitan.
 *
 * Tres tonos, no dos. `parcial` es ámbar y existe para que "no puedo
 * establecerlo" tenga dónde caer: si el único par disponible fuera
 * verde/rojo, ese caso terminaría pintado de verde, que es exactamente el
 * falso positivo que el veredicto de tres estados vino a cerrar.
 */
export function PanelVeredicto({
  tono,
  rotulo,
  titulo,
  children,
  formula,
  pie,
  remate,
}: {
  tono: "probado" | "rechazo" | "parcial";
  rotulo: ReactNode;
  titulo: ReactNode;
  children?: ReactNode;
  /** El renglón monoespaciado con la cuenta que se hizo. */
  formula?: ReactNode;
  pie?: ReactNode;
  /** Una sola frase grande al final. Se usa una vez en toda la app. */
  remate?: ReactNode;
}) {
  const separador = { borderTop: `1px solid rgba(241, 242, 247, .3)`, paddingTop: 18 };

  return (
    <div
      role="status"
      style={{
        background: `var(--pv-${tono})`,
        padding: "34px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: PAPEL,
      }}
    >
      <div
        style={{
          font: `600 10px/1 ${MONO}`,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          opacity: 0.75,
        }}
      >
        {rotulo}
      </div>

      <div
        style={{
          font: `600 clamp(30px, 3.8vw, 50px)/1.03 ${SG}`,
          letterSpacing: "-.035em",
          maxWidth: "22ch",
        }}
      >
        {titulo}
      </div>

      {children && (
        <div
          style={{
            font: `400 16px/1.6 ${SG}`,
            maxWidth: "52ch",
            opacity: 0.9,
            textWrap: "pretty",
          }}
        >
          {children}
        </div>
      )}

      {formula && (
        <div
          className="pv-hex"
          style={{ font: `500 13px/1.9 ${MONO}`, opacity: 0.9, ...separador }}
        >
          {formula}
        </div>
      )}

      {pie && (
        <div
          style={{
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            font: `500 13px/1.5 ${MONO}`,
            opacity: 0.9,
            ...separador,
          }}
        >
          {pie}
        </div>
      )}

      {remate && (
        <div
          style={{
            font: `500 clamp(19px, 2vw, 24px)/1.4 ${SG}`,
            letterSpacing: "-.02em",
            ...separador,
          }}
        >
          {remate}
        </div>
      )}
    </div>
  );
}

/**
 * Un valor que existe en la cuenta pero que no se muestra: texto del mismo
 * color que el fondo. Se puede seleccionar, pero no leer de un vistazo — que
 * es exactamente el estatus del secret dentro de una fórmula publicada.
 */
export function Tachado({ children }: { children: ReactNode }) {
  return <span style={{ background: PAPEL, color: PAPEL }}>{children}</span>;
}
