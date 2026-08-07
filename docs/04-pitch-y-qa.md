# 04 — Pitch, demo y Q&A

> Insumo de T9 (deck) y T10 (video). Dueño: Santiago. Communication pesa 10 %,
> UX 15 % y la honestidad técnica suma en Engineering (40 %) — este doc ataca
> los tres.

---

## 1. El pitch de 60 segundos

**Apertura (los primeros 20 segundos — la frase diferencial, siempre):**

> "Todos los sistemas de denuncia anónima que existen — y existen varios,
> cuatro en Midnight mismo — hacen el anonimato **permanente**. Testigo lo
> hace **reversible**: solo por el denunciante, solo ante la autoridad que él
> elija, solo cuando le convenga. Que es exactamente lo que la protección
> legal de denunciantes exige en la práctica: para cobrar la recompensa de la
> SEC — 10 a 30 % de la multa — tenés que probar que fuiste **el primero** en
> reportar. Hoy eso significa quemar tu anonimato ante todo el mundo. Con
> Testigo, no."

**Desarrollo (30 s):** el problema de las 4 condiciones incompatibles
(`00-idea.md §2`) → cómo lo resuelve el dual-ledger: pertenencia probada en
ZK, evidencia sellada, autoría recuperable con designated verifier.

**Cierre (10 s):** "El buzón anónimo es plomería. La autoría diferida es el
producto — está en papers desde 2023 y nadie la había shippeado. Nosotros sí,
este fin de semana, en Compact."

## 2. Estructura del deck

1. **La frase** (slide de apertura — el tiempo 4 primero, no el buzón).
2. El problema: proteger al denunciante ≠ anonimato eterno.
3. Cómo funciona: los 3 circuitos, qué es público y qué nunca sale de tu
   máquina (diagrama dual-ledger).
4. **Prior art de frente** (obligatoria): depapp, Dawn, SpillSafe, Catalyst
   F15, StealthNote — tabla con la columna "¿autoría diferida?" toda en ❌ y
   la fila de papers 2023–25 en "solo teoría". *"Esta es la línea que nadie
   cruzó."*
5. Demo (video o en vivo): los 4 tiempos.
6. **Limitaciones honestas:** emisor mock (como todos los comparables), no
   probamos veracidad del contenido, metadata off-chain con mitigaciones.
   Con este jurado la honestidad es un activo, no un pasivo.
7. BizDev: fiscalías, SEC-style rewards, Directiva UE de whistleblowing,
   compliance corporativo, sindicatos, periodismo de investigación.
8. Roadmap: emisor real (directorio corporativo), evidencia cifrada E2E al
   fiscal, fee-sponsor vía `Transaction.merge`.
9. Equipo + repo (Apache 2.0, tests verdes, simulación E2E — decirlo: QA es
   nota).

## 3. Q&A — las preguntas duras, con respuesta ensayada

**Q1 — "¿Y la wallet no delata al denunciante?" (la pregunta de IOG)**

> "Las transacciones de Midnight no tienen `msg.sender`. Un contract call se
> submitea como transcript público + prueba ZK verificada contra la verifier
> key del circuito — no hay firma de cuenta ni campo de origen en el formato
> del ledger; las únicas firmas van en offers de tokens unshielded, que no
> usamos. Los fees se pagan en tDUST shielded con commitment/nullifier, así
> que ni el pago de fees revela una dirección. El anonimato no vive solo en el
> circuito — la capa de transacción es senderless. Lo que Midnight no resuelve
> es la metadata off-chain: el indexer ve una sesión de viewing key y una IP.
> Mitigaciones: proof server local — está corriendo acá, en esta terminal —,
> Tor o nodo propio para submitear, y en el roadmap un fee-sponsor con
> `Transaction.merge`."

**Q2 — "Esto ya existe. depapp lo ganó en DEV.to."**

> "Sí, y está en la slide 4. depapp, Dawn, SpillSafe, la propuesta de Catalyst
> F15, StealthNote en Aztec: todos hacen el buzón anónimo, ninguno tiene
> revelación de autoría — Dawn es irrecuperable por diseño. La autoría
> diferida con designated verifier solo existe en papers de 2023–2025. Es
> exactamente lo que shippeamos este fin de semana."

**Q3 — "¿Cómo saben que la denuncia es verdadera?"**

> "No lo sabemos, y no lo prometemos. Testigo prueba dos cosas: que la
> denuncia viene de adentro y que nadie la alteró después. La veracidad del
> contenido la evalúa el fiscal, como siempre — pero ahora con evidencia
> sellada e íntegra, y con un canal para que el testigo aparezca cuando esté
> protegido."

**Q4 — "¿Quién emite las credenciales? ¿La empresa denunciada? 😏"**

> "En la demo el emisor es mock — como en todos los proyectos comparables,
> incluidos los ganadores. En producción el emisor natural es el que ya
> existe: el directorio corporativo (Azure AD/Google Workspace — StealthNote
> demostró esa vía con JWTs), un colegio profesional o el regulador. Y notá
> que a la empresa le conviene un canal interno creíble: la Directiva UE
> obliga a tener canal de denuncias; uno donde el empleado confía porque la
> empresa NO puede identificarlo es un producto de compliance, no una amenaza."

**Q5 — "¿Por qué blockchain? Esto es una base de datos con hashes."**

> "Tres cosas que una base de datos no da: el sellado no depende de confiar en
> quien opera el servidor — que en el caso de uso es potencialmente el
> adversario —; el timestamp de la denuncia es verificable por terceros para
> reclamar 'fui el primero'; y la prueba de pertenencia se verifica sin que
> exista ningún servidor que vea la credencial. El operador del server de un
> sistema web2 puede saber quién denunció; acá no existe ese rol."

**Q6 — "¿La prueba de autoría no la puede usar el empleador si la
intercepta?"**

> "No — ese es el designated verifier, el refinamiento que tomamos de la
> literatura. La autoría queda ligada a la clave pública del fiscal elegido:
> `H(secret ‖ denunciaId ‖ fiscalPk)`. Mostrada a cualquier otra clave no
> verifica nada, y lo demostramos en el video: misma prueba, otra clave, rojo."

**Q7 — "¿Qué evita el spam de denuncias falsas?"**

> "El nullifier: `H(secret ‖ org ‖ período)`. Una denuncia por persona, por
> organización, por período — sin identificar a nadie, porque nullifiers de
> períodos distintos no son linkeables. No podés ahogar el canal con mil
> denuncias, y tampoco podemos nosotros saber quién denunció."

**Q8 — "¿Y si la empresa correlaciona el timing? ¿O mira quién estaba en la
oficina?"**

> "Límite real y declarado: la anonimidad on-chain no protege contra side
> channels del mundo físico. Mitigaciones: períodos gruesos, y el denunciante
> elige cuándo submitear. Es el mismo límite de todo el prior art — la
> diferencia es que nosotros lo decimos en la slide 6."

**Q9 — "¿Modelo de negocio?"**

> "El comprador no es el denunciante: es quien necesita que existan denuncias
> creíbles. Programas de recompensa tipo SEC — que ya pagan 10–30 % de multas
> millonarias y necesitan probar quién reportó primero —, la Directiva UE que
> obliga a canales de denuncia a toda empresa de más de 50 empleados,
> fiscalías, sindicatos y consorcios de periodismo. Testigo es la
> infraestructura neutral entre ellos."

**Q10 — "¿Qué harían distinto con más tiempo?"**

> Roadmap honesto: emisor real, evidencia cifrada E2E al fiscal (T12 si no se
> hizo), fee-sponsor, auditoría del circuito. Nunca decir "nada".

## 4. Guion del video (≤ 3 min) — detalle en T10

Los 4 tiempos, con el proof server local visible en el tiempo 2 y el
contraste verde/rojo del designated verifier como cierre. La última frase del
video es la frase del pitch.

## 5. Reglas de higiene del pitch

- Cronometrar **en voz alta**, no leer en silencio. Dos pasadas mínimo.
- Cero opinión regulatoria/política; hechos con fuente (los reportes de
  `../../docs/research/` tienen las URLs).
- Nada entra a una slide sin fuente verificada. Lo no confirmado no existe.
- Quién responde qué en el Q&A: anonimato/infra → Gabriel; circuitos → Juan;
  producto/negocio → Santiago; demo → German.
