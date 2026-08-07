# 00 — Testigo: la idea

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

**Flujo de cuatro tiempos:** (1) la organización se registra → (2) un empleado
denuncia y la empresa mira el ledger sin poder saber quién fue → (3) la empresa
intenta alterar la evidencia y no puede → (4) meses después, el denunciante
prueba autoría ante el fiscal y obtiene protección legal.

## 4. El diferencial — verificado, no supuesto

**La idea base ya existe; el diferencial, no — en ninguna chain.**

| Proyecto | Dónde | ¿Buzón anónimo? | ¿Autoría diferida? |
|---|---|---|---|
| midnight-whistleblower (depapp) | Midnight — ganó el challenge oficial en DEV.to | ✅ | ❌ |
| Dawn | Midnight — ganó "Protect That Data" | ✅ | ❌ (irrecuperable por diseño) |
| SpillSafe | Midnight — Devpost 2025 | ✅ | ❌ |
| ZK Whistleblower | Catalyst Fund 15 (pendiente) | ✅ | ❌ |
| StealthNote / Semaphore / ZK-Whistle | Aztec / Ethereum / Scroll | ✅ | ❌ |
| Papers académicos 2023–2025 | MDPI, PriRPT | — | ✅ solo en teoría |

La revelación de autoría diferida existe únicamente en papers. **Nadie la
shippeó.** Acá se shippea, con el refinamiento que la literatura recomienda
(designated verifier).

Segundo diferencial verificado: **el anonimato aguanta la pregunta difícil.**
Las transacciones de Midnight no tienen `msg.sender` — los contract calls se
autorizan por prueba ZK y los fees se pagan shielded. Límites honestos: el
indexer ve viewing key e IP (mitigación: proof server local, Tor/nodo propio).

## 5. Qué NO es (limitaciones declaradas)

- **El emisor de credenciales es mock**, igual que en todos los proyectos
  comparables. El sistema valida el flujo ZK; la integración con un directorio
  corporativo real es roadmap.
- **No prueba que la denuncia sea verdadera.** Prueba que viene de adentro y
  que no fue alterada. La veracidad del contenido es un problema humano.
- **El anonimato on-chain está verificado; el off-chain tiene límites
  conocidos** (indexer ve viewing key e IP). Mitigaciones declaradas: proof
  server local, Tor/nodo propio, roadmap de fee-sponsor vía
  `Transaction.merge`.
