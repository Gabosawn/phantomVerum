import { useId, useRef, useState, type ReactNode } from "react";
import { MONO, SG } from "./base";

/**
 * Lector de archivo real.
 *
 * El archivo se lee con FileReader y se hashea en el browser: no hay ningún
 * `fetch` acá ni en ningún lado del camino. La leyenda "no se sube a ningún
 * lado" es una afirmación sobre el código, no una promesa de marketing.
 */
export function Dropzone({
  titulo,
  sub,
  onArchivo,
  accept,
}: {
  titulo: ReactNode;
  sub?: ReactNode;
  onArchivo: (archivo: File) => void;
  accept?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const id = useId();

  return (
    <>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) onArchivo(archivo);
          // Permite volver a elegir el mismo archivo.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="pv-dropzone"
        data-arrastrando={arrastrando ? "si" : "no"}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const archivo = e.dataTransfer.files?.[0];
          if (archivo) onArchivo(archivo);
        }}
        style={{
          appearance: "none",
          width: "100%",
          background: "none",
          border: "1.5px dashed var(--pv-h40)",
          color: "var(--pv-muted)",
          padding: "26px 20px",
          font: `500 14px/1.5 ${SG}`,
          textAlign: "center",
        }}
      >
        {titulo}
        {sub && (
          <>
            <br />
            <span style={{ font: `400 12px ${MONO}`, color: "var(--pv-dim)" }}>{sub}</span>
          </>
        )}
      </button>
    </>
  );
}
