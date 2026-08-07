import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";

const aca = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/**
 * Cada app tiene su propia raíz y su propio puerto a propósito.
 *
 * Cliente y Explorer terminan siendo dos ORÍGENES distintos, así que el browser
 * les da `localStorage` separado. La separación entre "lo que corre en tu
 * máquina" y "lo que es público" no es una convención nuestra que se pueda
 * violar por accidente: la impone el navegador.
 */
export function appConfig(nombre: string, puerto: number): UserConfig {
  return {
    root: aca(`./${nombre}`),
    // Compartido por las tres apps: la marca y los PDFs de muestra.
    publicDir: aca("./shared/publico"),
    plugins: [react()],
    resolve: {
      alias: { "@shared": aca("./shared") },
    },
    server: {
      port: puerto,
      strictPort: true,
      // `shared/` vive fuera de la raíz de la app, y `node_modules/` está en la
      // raíz del monorepo — sin esto Vite devuelve 403 en los .woff2 de
      // @fontsource y en dev las tipografías caen al fallback del sistema.
      fs: { allow: [aca("..")] },
    },
    build: {
      outDir: aca(`./dist/${nombre}`),
      emptyOutDir: true,
    },
  };
}
