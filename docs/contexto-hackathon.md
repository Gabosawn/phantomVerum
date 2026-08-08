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
> legal de denunciantes exige en la práctica: para cobrar cualquier recompensa
> o reclamar protección hay que poder **probar que fuiste vos**, y hoy eso
> significa quemar tu anonimato desde el día uno. Con Testigo, no."
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
No, y la razón es más fuerte que la que ensayamos al principio. El recibo que
queda en la cadena es `receiptOf(denunciaId, nonceDelFiscal)` — **sin el secret
adentro**. El fiscal genera un nonce, se lo manda al denunciante fuera de la
cadena, y después verifica **recomputando** ese hash y buscándolo en el ledger.
El empleador recomputa con su propio nonce, le da otro valor, y ese valor no
está publicado en ninguna parte. Nadie le entrega un secreto a nadie.

⚠️ **No decir "designated verifier".** Lo decíamos y era incorrecto: un esquema
designated-verifier real exige que el destinatario pueda *simular* una prueba
indistinguible con su clave, de modo que reenviarla no convenza a nadie. Acá el
recibo se verifica contra datos públicos, así que **es transferible una vez que
el fiscal comparte el nonce**. Lo que sí tenemos es separación por
destinatario. Un jurado técnico que lea `proveAuthorship.zkir` verá que no hay
ningún opcode `member` y va a pinchar la afirmación grande.

**"¿Qué evita el spam?"**
El nullifier: `H(dom ‖ credencialSecret ‖ período)`. Una denuncia por
credencial y por época, sin identificar a nadie (nullifiers de épocas distintas
no son linkeables).

⚠️ **`org` YA NO va adentro** — lo sacamos en la auditoría del 8/8, y si lo
mencionás abrís un flanco. Mientras estuvo, el `orgId` era un argumento público
que elegía quien llamaba y que nada restringía: como registrar una org es
gratis, la misma credencial compraba otra denuncia por época registrando una
org fantasma. Está reproducido en `contracts/test/sec-audit.mjs` bloque B.2.
El `período`, en cambio, sí está atado al `blockTime` por el circuito.

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

### ⚠️ Tres afirmaciones que NO hay que hacer (verificadas como falsas, 8/8)

1. **"10–30 % de la multa" y "el primero en reportar".** 15 U.S.C. §78u-6(b)(1)
   dice *"of what has been **collected**"*, no de la multa, y es **agregado
   entre todos los denunciantes**. El criterio no es llegar primero sino
   *"original information … that led to the successful enforcement"*, con
   umbral de sanciones > USD 1.000.000. Y 17 CFR §240.21F-7(b) exige abogado
   para denunciar anónimo y **revelar identidad antes de cobrar**: una denuncia
   en blockchain no es una submission válida ante la SEC. Somos un sello de
   evidencia *previo* al Form TCR.
2. **"Designated verifier".** Ver el Q&A de arriba.
3. **"El `orgId` no es público"**. Sí lo es: es un argumento del circuito, y
   los argumentos son public inputs de la prueba (`num_inputs: 3` en
   `report.zkir`). El árbol es global, así que la raíz no distingue orgs — pero
   el `orgId` sí.

**Gancho legal que SÍ se sostiene, y es mejor:** la Directiva UE 2019/1937.
Art. 6(3) — quien denunció de forma anónima y después es identificado y sufre
represalias **conserva la protección**; eso es exactamente lo que hace
coherente denunciar anónimo hoy y reclamar mañana. Y Art. 21(5) — **inversión
de la carga de la prueba**: si acreditás que denunciaste y sufriste un
perjuicio, se presume represalia. Hoy esa prueba la custodia quien te va a
despedir; nosotros se la damos al denunciante en un registro que el empleador
no controla. España (Ley 2/2023) es el mejor mercado: obliga a aceptar
denuncias anónimas y multa hasta 1.000.000 €.

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
