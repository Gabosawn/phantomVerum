# 00 — Testigo: la idea

> **Estado:** DEFINITIVO (6/8/2026). Versión operativa del documento canónico
> `../../docs/08-idea-final.md`; el razonamiento completo está en
> `../../docs/07-veredicto.md` y los tres reportes de `../../docs/research/`.
> Este doc alcanza para trabajar; aquellos, para el Q&A profundo.

---

## 1. La idea en una frase

**Testigo** es un sistema de denuncias de corrupción donde el denunciante
prueba que es de adentro de la organización sin revelar quién es, la evidencia
queda sellada e inalterable — y, a diferencia de **todos** los sistemas que
existen, **el anonimato es reversible: solo por el denunciante, solo ante la
autoridad que él elija, solo cuando le convenga.**

El nombre es literal: en Midnight, el estado privado se llama `witness` —
testigo.

## 2. El problema

Quien descubre fraude dentro de su organización necesita tres cosas hoy
incompatibles entre sí:

1. **Probar que es de adentro** — si no, es un rumor anónimo sin valor.
2. **Evidencia inalterable** — que ni él ni la empresa puedan cambiarla después.
3. **Que nadie sepa quién es** — probar pertenencia es achicar la lista de
   sospechosos.

Y una cuarta que ningún sistema existente resuelve: **la protección legal real
exige revelar la identidad tarde o temprano.** El programa de recompensas de la
SEC paga 10–30 % de la multa *solo a quien demuestra haber sido el primero en
reportar*. Hay que poder probar "esa denuncia la escribí yo" — sin que esa
prueba pueda caer en manos del empleador.

## 3. Cómo funciona

Tres circuitos Compact sobre el modelo dual-ledger de Midnight (detalle en
`01-arquitectura.md`):

1. **`registrarOrganizacion`** — la organización publica el ancla de sus
   credenciales en el ledger público.
2. **`denunciar`** — el corazón. Verifica *en privado* que el denunciante tiene
   credencial válida de esa organización y publica solo dos cosas: el hash de
   la evidencia (sellado) y un nullifier anti-spam (una denuncia por persona,
   por organización, por período). Identidad, credencial y evidencia nunca
   tocan la cadena.
3. **`revelarAutoria`** — el diferencial. Meses después, el denunciante prueba
   ante un fiscal que él escribió *esa* denuncia, sin revelar la evidencia ni
   su secret, **ligando la prueba a la clave pública del fiscal** (*designated
   verifier*): mostrada a cualquier otro — por ejemplo al empleador — no prueba
   nada.

**Demo de cuatro tiempos:** (1) la organización se registra → (2) un empleado
denuncia y la empresa mira el ledger sin poder saber quién fue → (3) la empresa
intenta alterar la evidencia y no puede → (4) meses después, el denunciante
prueba autoría ante el fiscal y obtiene protección legal. **El tiempo 4 es el
que ningún otro proyecto puede mostrar; el deck arranca por ahí.**

## 4. El diferencial — verificado, no supuesto

Tres investigaciones con fuentes (`../../docs/research/`) dejaron esto en claro:
**la idea base ya existe; el diferencial, no — en ninguna chain.**

| Proyecto | Dónde | ¿Buzón anónimo? | ¿Autoría diferida? |
|---|---|---|---|
| midnight-whistleblower (depapp) | Midnight — ganó el challenge oficial en DEV.to | ✅ | ❌ |
| Dawn | Midnight — ganó "Protect That Data" | ✅ | ❌ (irrecuperable por diseño) |
| SpillSafe | Midnight — Devpost 2025 | ✅ | ❌ |
| ZK Whistleblower | Catalyst Fund 15 (pendiente) | ✅ | ❌ |
| StealthNote / Semaphore / ZK-Whistle | Aztec / Ethereum / Scroll | ✅ | ❌ |
| Papers académicos 2023–2025 | MDPI, PriRPT | — | ✅ solo en teoría |

La revelación de autoría diferida existe únicamente en papers. **Nadie la
shippeó. Nosotros la shippeamos**, con el refinamiento que la literatura
recomienda (designated verifier). La frase del pitch:

> *"Todos los sistemas de denuncia existentes hacen el anonimato permanente.
> Testigo lo hace reversible — solo por el denunciante, solo ante la autoridad
> que él elija. Que es lo que la protección legal de denunciantes exige en la
> práctica."*

**El deck cita el prior art de frente** — los jueces incluyen a gente que lo
conoce (depapp ganó el challenge de la propia red) — y marca la línea exacta
que nadie cruzó.

Segundo diferencial verificado: **el anonimato aguanta la pregunta difícil.**
Las transacciones de Midnight no tienen `msg.sender` — los contract calls se
autorizan por prueba ZK y los fees se pagan shielded. La respuesta completa
para el jurado de IOG está en `04-pitch-y-qa.md §Q1`, con límites honestos
(indexer, IP) y mitigaciones.

## 5. Encaje con las reglas

Enunciado oficial: *"prove compliance, identity, and eligibility without
exposing sensitive user data"*. Testigo prueba **elegibilidad** dos veces sin
exponer datos: pertenezco a la organización (sin revelar quién soy) y soy el
autor original — elegible para protección legal o recompensa (sin revelar
evidencia ni secret hasta que yo decida, solo ante quien yo decida).

| Criterio | Peso | Cómo lo atacamos |
|---|---|---|
| Engineering & Implementation | 40 % | Dual-ledger de manual; 3 circuitos acotados que compilan; repo prolijo, topics y atribución |
| QA & Reliability | 15 % | Tests y archivos de simulación que pasan (T8) — la mayoría deja estos puntos en la mesa |
| Product & Vision | 15 % | Ítem #1 de governance del Request for Startups; 1 dApp construida contra 19 pedidas |
| UX & Design | 15 % | Frontend conectado E2E: vistas organización, denunciante y fiscal |
| Communication | 10 % | Demo de 4 tiempos con villano, video de 3 min ensayado, deck |
| BizDev & Viability | 5 % | Verificador con nombre: fiscalías, recompensas tipo SEC, Directiva UE, compliance |

Gates duros (checklist completo en `06-reglas-checklist.md`): si no compila →
descalificación automática; código 100 % nuevo desde el 7/8 10:00; Apache 2.0 +
repo público + label `midnightntwrk`; Beginner Track sin footprint previo;
entrega repo + deck + video antes del sábado 13:00.

## 6. Honestidad — qué NO es (para el deck y el Q&A)

- **El emisor de credenciales es mock**, igual que en todos los proyectos
  comparables. Se declara: el hackathon valida el flujo ZK; la integración con
  un directorio corporativo real es roadmap.
- **No prueba que la denuncia sea verdadera.** Prueba que viene de adentro y
  que no fue alterada. La veracidad del contenido es un problema humano.
- **El anonimato on-chain está verificado; el off-chain tiene límites
  conocidos** (indexer ve viewing key e IP). Mitigaciones declaradas: proof
  server local, Tor/nodo propio, roadmap de fee-sponsor vía
  `Transaction.merge`. Decirlo antes de que lo pregunten suma puntos de
  Engineering.
