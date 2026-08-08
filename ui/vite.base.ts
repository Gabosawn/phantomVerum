import { createReadStream, existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";
import type { Plugin, UserConfig } from "vite";

const aca = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/**
 * Serves the compiler's ZK artifacts at the paths `FetchZkConfigProvider`
 * asks for: `/keys/<circuitId>.prover|.verifier` and `/zkir/<circuitId>.bzkir`
 * (verified against the 4.1.1 package, which builds exactly those URLs).
 *
 * They are SERVED from `contracts/output`, not copied into `shared/publico`.
 * Two reasons, and the first one alone settles it: the proving keys weigh
 * ~25 MB and `contracts/output/` is gitignored precisely because it is build
 * output. Copying them in would put 25 MB of generated binaries under version
 * control, and — worse — create a second copy that goes stale the moment
 * anyone recompiles. `NodeZkConfigProvider` on the CLI side reads that same
 * directory, so both paths now prove against the same artifacts by
 * construction rather than by convention.
 *
 * A missing file gets a 404 rather than falling through to Vite's SPA
 * fallback: the provider explicitly detects a `text/html` body and reports it
 * as "the file does not exist and the server returned an SPA page", which is
 * a confusing way to learn you forgot to run `npm run compile`.
 */
function serveZkArtifacts(outputDir: string): Plugin {
  const CARPETAS = ["keys", "zkir"] as const;
  const EXTENSIONES = /\.(prover|verifier|bzkir)$/;
  let outDir: string | null = null;

  const resolverPedido = (url: string): string | null => {
    const limpia = url.split("?")[0] ?? "";
    const m = /^\/(keys|zkir)\/([A-Za-z0-9_-]+\.(?:prover|verifier|bzkir))$/.exec(limpia);
    // The regex admits no separators and no dots beyond the extension, so
    // nothing that reaches the join can climb out of `outputDir`.
    return m === null ? null : path.join(outputDir, m[1] as string, m[2] as string);
  };

  return {
    name: "phantomtrace:zk-artifacts",

    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const archivo = resolverPedido(req.url ?? "");
        if (archivo === null) return next();
        if (!existsSync(archivo)) {
          res.statusCode = 404;
          res.setHeader("content-type", "text/plain");
          res.end(
            `No existe ${archivo}.\n` +
              "Compilá el contrato: npm run compile --workspace=contracts\n",
          );
          return;
        }
        res.setHeader("content-type", "application/octet-stream");
        res.setHeader("cache-control", "no-cache");
        createReadStream(archivo).pipe(res);
      });
    },

    // Production build: the artifacts have to travel with the bundle.
    writeBundle() {
      if (outDir === null) return;
      for (const carpeta of CARPETAS) {
        const origen = path.join(outputDir, carpeta);
        if (!existsSync(origen)) continue;
        const destino = path.join(outDir, carpeta);
        mkdirSync(destino, { recursive: true });
        for (const archivo of readdirSync(origen)) {
          if (!EXTENSIONES.test(archivo)) continue;
          copyFileSync(path.join(origen, archivo), path.join(destino, archivo));
        }
      }
    },
  };
}

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
    plugins: [
      react(),
      wasm(),
      topLevelAwait(),
      watchShared(aca("./shared")),
      serveZkArtifacts(aca("../contracts/output")),
    ],
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
