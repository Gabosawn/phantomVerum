# TODO

## Fixes técnicos

- [ ] Dejar `npm test` completamente verde en un entorno limpio.
- [ ] Resolver los permisos de ejecución de los wrappers en `node_modules/.bin` para que `vitest` y `tsc` funcionen mediante los scripts estándar.
- [ ] Corregir la carga de la dependencia nativa de Rollup (`@rollup/rollup-linux-x64-gnu`) y verificar que Vitest pueda iniciar.
- [ ] Regenerar los artefactos de Compact antes de ejecutar las pruebas (`compact compile`), evitando que `contracts/output/contract/index.js` quede desactualizado respecto de `src/testigo.compact`.
- [ ] Alinear el harness de tests con el artefacto generado: actualmente busca `contracts/output/contract/index.cjs`, mientras Compact genera `index.js`.
- [ ] Activar y validar el backend de contrato real en `tests/`, no solo el backend de modelo.
- [ ] Ejecutar la suite completa contra el contrato compilado y confirmar que todas las aserciones pasan en ambos backends.
- [ ] Revisar los scripts de build, test y simulate para que funcionen con una instalación limpia usando únicamente los comandos documentados.

## Revisión integral del proyecto

- [ ] Revisar la coherencia completa entre la idea, `docs/00-idea.md`, la arquitectura de `docs/01-arquitectura.md`, los contratos Compact, el wiring TypeScript, la UI y las pruebas.
- [ ] Confirmar que la implementación conserva la semántica acordada: anonimato del denunciante, compromiso de credencial, evidencia privada, nullifier anti-spam y autoría revelable solo al verificador designado.
- [ ] Verificar que los nombres y responsabilidades de circuitos, API, CLI, ledger, witnesses y vistas de UI sean consistentes entre todos los módulos.
- [ ] Comprobar el funcionamiento correcto del flujo completo: registrar organización, emitir credencial, denunciar, impedir duplicados, verificar evidencia y revelar/verificar autoría.
- [ ] Revisar que ningún secret, identidad, evidencia o private state se filtre en logs, transcript público, ledger, UI o artefactos generados.
- [ ] Validar el flujo tanto con el simulador como contra el contrato real y documentar cualquier diferencia de comportamiento.
- [ ] Actualizar el README y la documentación de bloques para reflejar el estado real de A, B, C y D, eliminando pendientes obsoletos.
- [ ] Revisar el estado de la UI y confirmar que sus tres vistas estén conectadas al mismo contrato de API y respeten el modelo de privacidad.
- [ ] Ejecutar una revisión final de seguridad, integración y demo antes de considerar la rama lista para entrega.

## Verificación final

- [ ] `npm install` en un checkout limpio.
- [ ] `npm run compile` sin errores.
- [ ] `npm test` sin errores.
- [ ] `npm run simulate` ejecutando el flujo E2E completo.
- [ ] Confirmar que `git status` quede limpio después de la verificación, salvo artefactos ignorados esperados.
