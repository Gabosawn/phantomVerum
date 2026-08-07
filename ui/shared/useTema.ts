import { useCallback, useEffect, useState } from "react";

/**
 * Cada app arranca en su registro nativo — Cliente oscuro, Explorer claro —
 * porque eso ES el mensaje. El toggle existe para condiciones de proyección
 * malas, no para preferencia estética, así que la etiqueta dice a qué se pasa
 * y no en cuál estás.
 */
export function useTema(namespace: string, nativo: "oscuro" | "claro") {
  const clave = `pv:tema:${namespace}`;
  const [invertido, setInvertido] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(clave) === "1") setInvertido(true);
    } catch {
      /* storage bloqueado: se queda en el nativo */
    }
  }, [clave]);

  useEffect(() => {
    if (invertido) document.body.setAttribute("data-tema", "invertido");
    else document.body.removeAttribute("data-tema");
  }, [invertido]);

  const alternar = useCallback(() => {
    setInvertido((previo) => {
      const siguiente = !previo;
      try {
        localStorage.setItem(clave, siguiente ? "1" : "0");
      } catch {
        /* idem */
      }
      return siguiente;
    });
  }, [clave]);

  const esOscuro = nativo === "oscuro" ? !invertido : invertido;

  return { invertido, alternar, etiqueta: esOscuro ? "claro" : "oscuro" };
}
