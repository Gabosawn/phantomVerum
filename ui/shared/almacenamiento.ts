/**
 * `localStorage` con namespace por app.
 *
 * Cliente y Explorer corren en puertos distintos, así que son orígenes
 * distintos y el browser ya les da almacenamiento separado. El namespace es
 * cinturón sobre tiradores: si alguna vez alguien las sirve desde el mismo
 * origen, las claves siguen sin pisarse.
 *
 * Todo va envuelto en try/catch porque en modo incógnito o con storage
 * bloqueado esto tira, y la demo no se puede caer por eso.
 */

export function crearAlmacen(namespace: string) {
  const clave = (k: string) => `pv:${namespace}:${k}`;

  return {
    leer<T>(k: string, porDefecto: T): T {
      try {
        const crudo = localStorage.getItem(clave(k));
        return crudo === null ? porDefecto : (JSON.parse(crudo) as T);
      } catch {
        return porDefecto;
      }
    },

    escribir<T>(k: string, valor: T): void {
      try {
        localStorage.setItem(clave(k), JSON.stringify(valor));
      } catch {
        /* sin persistencia: la sesión sigue funcionando en memoria */
      }
    },

    borrar(k: string): void {
      try {
        localStorage.removeItem(clave(k));
      } catch {
        /* idem */
      }
    },

    vaciar(): void {
      try {
        const prefijo = `pv:${namespace}:`;
        const aBorrar: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(prefijo)) aBorrar.push(k);
        }
        for (const k of aBorrar) localStorage.removeItem(k);
      } catch {
        /* idem */
      }
    },
  };
}

export type Almacen = ReturnType<typeof crearAlmacen>;
