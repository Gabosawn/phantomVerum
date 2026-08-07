# 06 — Reglas del evento y checklist de entrega

> Árbitro de reglas: **Santiago**. Cualquier duda se resuelve contra el
> [PDF oficial](https://mpc.midnight.network/hubfs/Midnight_Hack_Buenos_Aires_Official_Rules.pdf),
> no contra la memoria de nadie. Este checklist se pasa completo en T11,
> sábado 11:00.

## Gates duros (descalifican)

| Regla | Qué significa para nosotros |
|---|---|
| **El contrato Compact tiene que compilar** | Descalificación automática si no. main siempre compila; tag `backup` de T1 como seguro |
| **Código 100 % nuevo desde el vie 7/8 10:00** | Todo lo previo es diseño en docs (permitido). Ni una línea de Compact/TS antes. No copiar código del prior art |
| **Repo público + Apache 2.0** | Se crea así desde el primer push (T0), no se arregla al final |
| **Label `midnightntwrk` + topics de Midnight** | Puntos explícitos de Engineering; Gabriel al crear el repo |
| **Beginner Track: sin footprint previo en Midnight** | Los cuatro cumplen (condición atestada del track). Equipo ≤ 4 ✅ |
| **Un track por proyecto** | Beginner Track, decidido |
| **Entrega: repo + deck + video, sáb 8 13:00 ART** | Regla de la casa: submit 12:00 |

## La rúbrica (verbatim del PDF, verificada)

| Criterio | Peso | Dueño de que se cobre |
|---|---|---|
| Engineering & Implementation | 40 % | Juan + Gabriel (código) · Santiago (repo prolijo, README, topics, atribución) |
| QA & Reliability | 15 % | Santiago — tests + archivos de simulación **que pasen** |
| Product & Vision | 15 % | Santiago (deck) — Request for Startups ítem #1, roadmap honesto |
| UX & Design | 15 % | German — frontend conectado E2E (exigido, mocks no cuentan) |
| Communication | 10 % | Santiago — video ≤ 3 min ensayado + deck |
| BizDev & Viability | 5 % | Santiago — verificador con nombre (SEC, Directiva UE, fiscalías) |

## Checklist de entrega (T11 — sábado 11:00)

### Repo
- [ ] main compila (`compact` sin errores) — **verificado en limpio, clon nuevo**
- [ ] Tests verdes con un comando, documentado en el README
- [ ] Simulación E2E corre con un comando
- [ ] Licencia Apache 2.0 en el repo
- [ ] Repo público, label `midnightntwrk`, topics de Midnight
- [ ] README: qué es, cómo correr todo, arquitectura resumida, limitaciones
      honestas, atribución al ecosistema (docs/ejemplos oficiales usados)
- [ ] `docs/DESVIOS.md` al día (versiones, direcciones, decisiones)
- [ ] Dirección del contrato en testnet + hash de tx de ejemplo en el README
- [ ] Ni una línea de código con fecha anterior al vie 10:00

### Deck
- [ ] La frase diferencial en los primeros 20 s
- [ ] Slide de prior art con la tabla de ❌
- [ ] Slide de limitaciones honestas
- [ ] BizDev con verificador con nombre
- [ ] Exportado a PDF (no depender de internet/fuentes)

### Video
- [ ] ≤ 3 minutos, los 4 tiempos de la demo
- [ ] Proof server local visible al menos una vez
- [ ] Contraste verde/rojo del designated verifier al cierre
- [ ] Audio o subtítulos legibles
- [ ] Subido (link estable) y linkeado en el README

### Submit
- [ ] Formulario de entrega enviado por Gabriel **a las 12:00**
- [ ] Screenshot de la confirmación en el grupo
- [ ] Verificado que el link del repo, deck y video abren en incógnito
