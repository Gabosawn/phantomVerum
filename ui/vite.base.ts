import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";
import type { Plugin, UserConfig } from "vite";

const aca = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/**
 * Vite only watches the app root. `shared/` lives outside it and is served
 * through `/@fs`, so it enters the module graph but NOT the file watcher: edit
 * it and the browser keeps serving the version transformed at startup, with the
 * change appearing only after a server restart. With nearly all of the three
 * apps' logic living there, that is a trap — a stale `verificarAutoria` that
 * returned green for the wrong key survived a live run this way.
 */
function watchShared(dir: string): Plugin {
  return {
    name: "phantomtrace:watch-shared",
    apply: "serve",
    configureServer(server) {
      server.watcher.add(dir);
    },
  };
}

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
    // compact-runtime's WASM (persistentHash) needs the wasm plugin; the
    // onchain-runtime entry it resolves to in the browser uses top-level await.
    plugins: [react(), wasm(), topLevelAwait(), watchShared(aca("./shared"))],
    resolve: {
      alias: {
        "@shared": aca("./shared"),
        "@contracts": aca("../contracts/output"),
      },
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
