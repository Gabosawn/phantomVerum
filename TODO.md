# TODO — audit 2026-08-07

Findings from bringing up the monorepo (`npm install`, `npm run compile`, `npm test`, `npm run build`, proof server).

## Environment

- [x] `npm install`
- [x] `npm run compile` (4 Compact circuits)
- [x] Contract smoke / merkle / security suites green
- [x] Proof server: `phantomtrace-proof-server` on `:6300` (`docker.io/midnightntwrk/proof-server:latest`). Health is `GET /` → `{"status":"ok"}` (not `/health`)
- [ ] UI: scaffold only; `5173` may be taken by other containers — use port `5174`

## Technical fixes

### FS `noexec` on `/home/snatty/Data`

- [x] **P1** npm scripts invoke `tsc` / `vitest` / `vite` via `node` (`.bin` shebangs fail with exit 126)
- [x] **P1** Rollup native `.node` fails (`ERR_DLOPEN_FAILED`) — `postinstall` switches to `@rollup/wasm-node` and relocates esbuild binaries under `/tmp`

### Contract test backend alignment

- [x] **P1** Harness loads `contracts/output/contract/index.js` (ESM) instead of missing `index.cjs`
- [x] **P1** `ASSERTS` match Compact messages
- [x] **P1** Model ↔ contract semantics: domain tags, `credCommitmentDe` / `hojaDe`, epoch `Uint<64>` + `blockTime`, nullifier from `credencialSecret`, path witness returns siblings only
- [x] **P2** Differential suite (model + contract) and `npm run simulate` green
- [ ] **P2** README / docs still mention `index.cjs` in places
- [ ] **P2** Document full Docker image name (`docker.io/midnightntwrk/...`) for podman short-name issues

## Broader review (after green)

- [ ] End-to-end coherence: idea ↔ architecture ↔ Compact ↔ app wiring ↔ UI ↔ tests
- [ ] Privacy: no secrets / evidence in logs, transcript, or UI
- [ ] UI: three views wired to the same API
- [x] README: accurate block A/B/C/D status (vie 7/8 ~16:35)

## Final verification

- [x] `npm run compile`
- [x] `npm test` (model + contract, 38 Vitest cases)
- [x] `npm run simulate`
- [x] `npm run build` (UI scaffold stubs in English)
- [ ] UI `dev` fully wired to `@phantomtrace/app`
