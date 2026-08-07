# Contexto del hackathon (material de referencia)

> **Este doc es solo contexto.** No está referenciado por el README ni por
> `AGENTS.md` y nada acá condiciona el desarrollo. Es el material de
> preparación del Midnight Hack BA 2026 (pitch, Q&A, reglas del evento,
> organización del equipo) conservado por si sirve para presentar el proyecto.

---

## Pitch de 60 segundos

> "Todos los sistemas de denuncia anónima que existen — y existen varios,
> cuatro en Midnight mismo — hacen el anonimato **permanente**. Testigo lo
> hace **reversible**: solo por el denunciante, solo ante la autoridad que él
> elija, solo cuando le convenga. Que es exactamente lo que la protección
> legal de denunciantes exige en la práctica: para cobrar la recompensa de la
> SEC — 10 a 30 % de la multa — tenés que probar que fuiste **el primero** en
> reportar. Hoy eso significa quemar tu anonimato ante todo el mundo. Con
> Testigo, no."
>
> "El buzón anónimo es plomería. La autoría diferida es el producto — está en
> papers desde 2023 y nadie la había shippeado. Nosotros sí."

## Q&A difícil (respuestas ensayadas)

**"¿Y la wallet no delata al denunciante?"**
Las transacciones de Midnight no tienen `msg.sender`. Un contract call se
submitea como transcript público + prueba ZK verificada contra la verifier key
del circuito — no hay firma de cuenta ni campo de origen en el formato del
ledger. Los fees se pagan en tDUST shielded con commitment/nullifier. Lo que
Midnight no resuelve es la metadata off-chain (indexer ve viewing key e IP);
mitigaciones: proof server local, Tor o nodo propio, roadmap fee-sponsor vía
`Transaction.merge`.

**"Esto ya existe. depapp lo ganó en DEV.to."**
Sí — depapp, Dawn, SpillSafe, Catalyst F15, StealthNote: todos hacen el buzón
anónimo, ninguno tiene revelación de autoría. La autoría diferida con
designated verifier solo existe en papers 2023–2025.

**"¿Cómo saben que la denuncia es verdadera?"**
No lo sabemos y no lo prometemos. Se prueba que viene de adentro y que nadie
la alteró después. La veracidad la evalúa el fiscal, como siempre.

**"¿Quién emite las credenciales? ¿La empresa denunciada?"**
El emisor es mock. En producción: directorio corporativo (Azure AD/Google
Workspace — StealthNote demostró esa vía con JWTs), un colegio profesional o
el regulador.

**"¿Por qué blockchain? Esto es una base de datos con hashes."**
Tres cosas que una DB no da: el sellado no depende de confiar en quien opera
el servidor (que puede ser el adversario); el timestamp es verificable por
terceros para reclamar "fui el primero"; y la prueba de pertenencia se
verifica sin que ningún servidor vea la credencial.

**"¿La prueba de autoría no la puede usar el empleador si la intercepta?"**
No — designated verifier: `H(secret ‖ denunciaId ‖ fiscalPk)`. Con otra clave
no verifica nada.

**"¿Qué evita el spam?"**
El nullifier: `H(secret ‖ org ‖ período)`. Una denuncia por persona, org y
período, sin identificar a nadie (nullifiers de períodos distintos no son
linkeables).

**"¿Timing correlation / side channels físicos?"**
Límite real y declarado. Mitigación parcial: períodos gruesos y el denunciante
elige cuándo submitear.

**"¿Modelo de negocio?"**
El comprador es quien necesita denuncias creíbles: programas de recompensa
tipo SEC, Directiva UE de whistleblowing (obligatoria para empresas de +50
empleados), fiscalías, sindicatos, periodismo de investigación.

**"¿Qué harían con más tiempo?"**
Emisor real, evidencia cifrada E2E al fiscal, fee-sponsor, auditoría del
circuito.

## Estructura de deck sugerida

1. La frase diferencial (autoría diferida primero, no el buzón)
2. El problema: proteger al denunciante ≠ anonimato eterno
3. Cómo funciona: 3 circuitos, qué es público y qué nunca sale de tu máquina
4. Prior art de frente (tabla con "¿autoría diferida?" toda en ❌)
5. Demo: los 4 tiempos
6. Limitaciones honestas (emisor mock, veracidad, metadata off-chain)
7. BizDev: fiscalías, SEC-style rewards, Directiva UE, compliance
8. Roadmap: emisor real, evidencia cifrada E2E, fee-sponsor
9. Equipo + repo

## Reglas del evento que aplicaron (histórico)

- El contrato Compact tiene que compilar (gate de descalificación)
- Código 100 % nuevo desde el vie 7/8 10:00
- Repo público + Apache 2.0 + label `midnightntwrk`
- Entrega: repo + deck + video ≤ 3 min, sábado 8 13:00 ART

## Organización del equipo durante el evento (histórico)

- **GABRIEL** — lead técnico: toolchain, proof server, wiring TS, deploy
- **JUAN** — contratos Compact (los 3 circuitos)
- **GERMAN** — frontend (3 vistas, integración E2E)
- **SANTIAGO** — QA (tests + simulación) y comunicación (deck, video, submit)

Protocolo que se usó: main siempre compila, Conventional Commits con ID de
task (`feat(T2): ...`), push cada hora, sync points de 10 min, protocolo de
bloqueo al doble del timebox.
