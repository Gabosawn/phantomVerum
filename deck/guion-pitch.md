# Guion del pitch — PhantomTrace (3–4 min)

> Lo que dice el presentador, slide por slide, calzado con `deck/pitch.html`
> (14 slides). Registro hablado, no leído. Cronometrado para **3:40**; con las
> partes marcadas *(recortable)* baja a **3:00**.
>
> **v2 — revisado por un panel de 4 críticos (jurado técnico, coach de
> narrativa, fact-check adversarial, posicionamiento) el 8/8.** Cada frase de
> acá sobrevive a un jurado técnico de Midnight. Lo que NO hay que decir está al
> final, en "Trampas". Los cambios grandes de esta versión: hook humano (Lena),
> "dual-ledger" dicho bien, profundidad de ingeniería, y el wow reubicado donde
> el visual lo respalda.

**Regla de oro de entrega:** una idea por slide. Pausá en los ✅/❌. No leas la
slide — vos contás la historia, la slide es el respaldo. Decí el nombre del
hackathon en los primeros ~15 segundos.

> ⚠️ **Antes de presentar, decidir 2 cosas de equipo** (ver "Cambios de deck
> sugeridos" al final): (1) el nombre — el deck dice **PhantomTrace**, varios
> docs dicen **Testigo**: elegí UNO en repo, deck y video. (2) El wow (✅/❌)
> hoy aparece en 3 slides (5, 6-mock, 11); conviene que impacte una sola vez,
> fuerte, en la 11.

---

## 0:00 — Slide 1 · "El anonimato, reversible."
*(portada · 22s · abrí con una persona, no con una abstracción)*

> "Lena descubre un fraude de cuarenta millones en la empresa donde trabaja.
> Para cobrar la recompensa, o para que la ley la proteja, tiene que poder
> **probar que fue ella** la que avisó. Pero el día que da la cara, la echan.
> Hoy denunciar en serio es elegir: **o estás a salvo, o podés reclamar.**
> Somos PhantomTrace, Midnight Hack Buenos Aires, y borramos esa elección:
> hacemos el anonimato **reversible** — probás que fuiste vos cuando quieras,
> ante quien elijas, y ante nadie más."

🎯 *Abrir con Lena agarra a un jurado cansado más rápido que una tesis. Nombre
del hackathon a los ~15s. La frase de nueve palabras si querés un remate:
"Anónimo ante el mundo, demostrable ante uno, reversible solo por el autor."*

---

## 0:22 — Slide 2 · "Hoy elegís: anonimato o recompensa."
*(el problema · 22s)*

> "Ese es el dilema, y es de todos los que saben algo. Para cobrar protección o
> reclamar cuando te toman represalias, tenés que probar que fuiste vos — y hoy
> eso quema tu anonimato desde el día uno. Entonces el que sabe se calla, o
> denuncia y queda expuesto. Proteger al denunciante **no** es lo mismo que
> anonimato eterno."

🎯 *Marcá el "o" con la voz: anonimato O recompensa. No cites porcentajes de la
SEC — mirá Trampas #3.*

---

## 0:44 — Slide 3 · "Lo privado no sale de tu máquina. Lo público es un hash."
*(la solución · Midnight · 24s · acá se gana el 40% de Engineering)*

> "Lo resolvemos con Midnight — una blockchain donde la lógica corre como prueba
> ZK y el estado sensible nunca se publica. La evidencia, la credencial y la
> identidad son **witness**: se prueban en zero-knowledge y **el proving corre
> local**, así nunca cruzan a un input público. Lo único que sale por
> `disclose()` al ledger es un puñado de valores — el sello de la denuncia, un
> nullifier, la época y una raíz de Merkle. Nada más. Y las transacciones de
> Midnight **no tienen remitente**: no hay `msg.sender`, la autorización es la
> prueba. No hay a quién delatar."

🎯 *Este es el corazón técnico. Decí witness, `disclose()`, proving local, sin
`msg.sender` con seguridad — te juzgan ingenieros de Midnight. No digas "nunca
sale de tu máquina" en absoluto: el proof server ve los witness (por eso
recalcás "local").*

---

## 1:08 — Slide 4 · "De la denuncia sellada a la autoría probada."
*(los 4 tiempos · 22s)*

> "Son cuatro tiempos. **Uno**: la empresa ancla sus credenciales en la cadena.
> **Dos**: un empleado denuncia — el circuito prueba en privado que tiene una
> credencial válida, contra un `HistoricMerkleTree`: prueba pertenencia contra
> cualquier raíz histórica, así emitir credenciales nuevas no le invalida la
> prueba. **Tres**: el hash de la evidencia queda sellado, inmutable. **Cuatro**,
> meses después: revela su autoría ante quien elija."

🎯 *Contá con los dedos 1-2-3-4. El "HistoricMerkleTree y no uno común" es
profundidad de ingeniería gratis — un ingeniero de Midnight lo registra.*

---

## 1:30 — Slide 5 · "Un solo H(). Todo depende de qué entra."
*(el mecanismo · 22s · acá el deck ya muestra el ✅/❌ del recibo)*

> "Todo el sistema es un solo hash, con separación de dominios, usado tres veces
> — y la clave está en qué le entra. El **sello** mezcla la evidencia con tu
> secreto. El **nullifier** — el anti-spam — mezcla el secreto de la credencial
> con la época; y ojo: **la época no la elige quien denuncia**, el circuito la
> clava al reloj de la cadena. El **recibo** de autoría mezcla la denuncia con un
> nonce que te manda el fiscal: el fiscal lo recomputa con su nonce y lo
> encuentra; con otro nonce, sale otro valor."

🎯 *No te enredes en fórmulas. Si te preguntan por el nullifier: el mismo
secreto alimenta la pertenencia y el nullifier dentro del circuito, así nadie
prueba con una credencial y quema el nullifier de otra. Eso a Q&A.*

---

## 1:52 — Slide 6 · "Dos apps. Dos orígenes. Sin estado compartido."
*(la frontera de privacidad · 20s · acá arreglamos qué es el dual-ledger)*

> "Ubiquémonos en el modelo de Midnight: hay un ledger **público** y uno
> **shielded**. Nuestro contrato vive entero en el público — solo escribe
> commitments, nullifiers y raíces; **no mueve un solo token**. Lo shielded
> aparece en un lugar: el fee, que se paga en DUST con su propio esquema de
> commitment y nullifier, sin ligar la denuncia a una cuenta. Y la frontera de
> privacidad la hicimos **arquitectura**: dos apps. El Cliente corre local y
> guarda los witness; el Explorer solo lee el ledger público. Nada privado tiene
> dónde filtrarse."

🎯 *IMPORTANTE: el "dual-ledger" es público + shielded, NO "dos apps". Las dos
apps son la frontera de privacidad. Esta corrección sube el 40% — decirlo mal
hace rodar los ojos al panel.*

---

## 2:12 — Slide 7 · "El buzón ya existe. La autoría diferida, no."
*(prior art · 18s · nombrá a Vera vos primero)*

> "Seamos honestos con el estado del arte. El buzón anónimo ya existe — hasta
> Vera Report, de la propia Foundation, resolvió el reporting anónimo en
> Midnight. Pero Vera, y todos, hacen el anonimato **permanente**. Ninguno deja
> al autor volver y probar que fue él, ante un destinatario elegido. Y Midnight
> pidió exactamente esto: su Request for Startups lista whistleblowing anónimo
> con evidencia tamper-proof. Esa pieza — la autoría diferida — nadie la había
> shippeado en producción. Nosotros sí."

🎯 *Nombrar a Vera vos primero le saca el arma al juez. NO digas "primer
reporting anónimo" (es de Vera): vos tenés "primer anonimato reversible". Si no
podés citar el RFS textual, parafraseá sin comillas.*

---

## 2:30 — Slides 8–10 · El caso Nordwind *(recortable: contá 8 y 10, saltá 9)*

> "Aterrizado, y es un caso compuesto de casos reales: Nordwind Logistics, ocho
> mil empleados. Lena, de contaduría, ve el fraude — pero el canal interno lo
> opera justo el área que tendría que denunciar. Por eso nadie lo usa.
> *(slide 9, recortable)* Las credenciales se enchufan al Azure AD que la empresa
> ya tiene, sin cambiar nada. *(slide 10)* Y cuando llega el momento de reclamar,
> Lena abre la prueba **solo ante el fiscal** — Nordwind nunca se entera de quién
> fue, y la Directiva UE la protege aunque después la identifiquen. Nunca tuvo
> que elegir entre estar a salvo y poder reclamar."

🎯 *Si vas corto, contá la escena (8) y el remate (10), saltá el despliegue (9).
La última frase es el corazón emocional — bajá el ritmo. No digas "cobra la
recompensa de la SEC": somos un sello previo, la protección real es la UE.*

---

## 3:00 — Slide 11 · "Los 4 tiempos corren en Preview." — EL MOMENTO
*(honestidad + prueba + wow · 22s · acá cae el ✅/❌ con datos reales)*

> "Y esto no es maqueta: los cuatro tiempos ya corrieron en la testnet Preview,
> contra el contrato desplegado — cada bloque es verificable desde una terminal.
> Y acá está el momento: **los mismos bytes, dos personas.** El fiscal que Lena
> eligió — con su nonce — verifica. El empleador, que no tiene ese nonce, ni
> siquiera puede ubicar el recibo en la cadena. Y fijate el autor on-chain: no
> está. Nunca estuvo."

🎯 *ACÁ frenás. Señalá el ✅ FISCAL y el ❌ EMPLEADOR. Dos segundos de silencio.
Es tu diferenciador hecho imagen, con bloques reales debajo. NO expliques la
"recomputación desde datos públicos" — eso mata el momento; va a Q&A.*

---

## 3:22 — Slide 12 · "Tests con dientes."
*(ingeniería + QA · 13s)*

> "Debajo hay ingeniería de verdad. Verificamos por **diferencial**: dos
> implementaciones independientes tienen que coincidir en cada resultado
> publicado, o la suite rompe. Cuarenta y ocho casos, **trescientos setenta y
> cinco chequeos**, todos verdes. Y trece bugs que inyectamos a propósito — los
> trece mueren. Compila limpio desde un clone, con el compilador pinneado."

🎯 *Arrancá por el diferencial (es lo que premia un ingeniero de fiabilidad).
Decí "48 casos, 375 chequeos" — así coincide con el "48" que muestra la slide.*

---

## 3:35 — Slide 13 · "Denuncias creíbles, como producto." *(recortable)*

> "Quién compra esto: la empresa de más de cincuenta empleados que la
> **Directiva Europea** obliga a tener un canal de denuncias — pero que no quiere
> custodiar una base de datos de denunciantes que le pueden filtrar. Somos ese
> canal: cumple la ley sin crear el riesgo."

🎯 *Si vas justo, saltala: el producto ya se entendió con Nordwind. Un comprador,
un gancho legal (UE), una línea. Business Viability pesa solo 5%.*

---

## 3:48 — Slide 14 · Cierre
*(callback a Lena · 14s)*

> "Lena denunció esa misma noche, anónima. Y el día que quiso, probó que fue
> ella — solo ante el fiscal, nunca ante la empresa. Nunca tuvo que elegir entre
> estar a salvo y reclamar. El buzón anónimo es plomería; la autoría diferida es
> el producto. Nadie la había shippeado. **Nosotros sí. PhantomTrace.**"

🎯 *El repo, Apache 2.0 y el label viven en la slide, no en tu boca. Última
palabra: "PhantomTrace". Silencio. Sonreí.*

---

# Trampas — lo que NO hay que decir (te falsean en vivo)

Verificado contra el código y el ledger de Midnight (auditoría 8–9/8):

1. **NO digas "designated verifier"** como propiedad cripto. El recibo se
   verifica contra datos públicos → es **transferible una vez que el fiscal
   comparte su nonce**. Es *separación por destinatario*, no no-transferibilidad.
   Un juez que lea `proveAuthorship.zkir` ve que no hay opcode `member`. Decí
   "ligado a un destinatario por vez". (Ya sacado del deck; no lo reintroduzcas.)
2. **NO digas que `report` publica el `orgId`** ni "los argumentos del circuito
   son públicos". `report` publica el sello, el nullifier, la época y la raíz —
   **no el `orgId`**. La org es pública porque se **registra y emite
   credenciales**, no por la denuncia. Frase segura: "una denuncia individual no
   revela de qué org es".
3. **NO digas "10–30% de la multa al primero en reportar".** La ley SEC dice "de
   lo **recaudado**", agregado, y exige revelar identidad para cobrar. Somos un
   **sello de evidencia previo**, no una submission ante la SEC. Andá a la
   **Directiva UE 2019/1937** (protección + inversión de la carga de la prueba).
4. **NO digas "inventamos" la técnica.** Commitment + firma a destinatario son de
   1996. La novedad es **el workflow productizado, sobre una ZK chain en vivo**.
5. **NO digas "no mueve tokens" y "dual-ledger = dos apps" en la misma frase mal.**
   El contrato vive en el ledger público; el shielded es el fee en DUST.

---

# Q&A — respuestas de un renglón (ensayadas)

- **"¿La wallet no lo delata?"** → Midnight no tiene `msg.sender`; la tx es
  transcript público + prueba ZK. Fees en DUST shielded. El límite es la
  metadata off-chain: el indexer ve la viewing key y la IP, y la wallet que paga
  el DUST liga las tx — se mitiga con proof server local, Tor y **wallet fresca
  por denuncia**.
- **"¿No es un designated verifier de verdad?"** → No. Es separación por
  destinatario: el recibo se recomputa con el nonce del fiscal. Una vez que él
  comparte el nonce, es verificable por terceros. La no-transferibilidad real
  (esquema DV con simulación) está en el roadmap.
- **"¿Y el anonimato dentro de la org? ¿La raíz de Merkle no lo estrecha?"**
  *(own H-1, desarma):* → Buen punto. El conjunto de anonimato es tan grande como
  las credenciales que emitió tu org; con pocas y recientes, el emisor —que ve
  cada emisión— podría estrecharlo. Por eso el roadmap trae un piso de
  k-anonimato in-circuit y emisión en batch.
- **"¿La emisión on-chain está autenticada de verdad?"** *(own C-1):* → En el
  demo el secreto del emisor se deriva del `orgId` público, así que la emisión
  on-chain es **demo-grade**; el contrato hace la verificación bien, el fix real
  (secret aleatorio en vault) es una hora.
- **"¿Cómo saben que la denuncia es verdadera?"** → No lo sabemos y no lo
  prometemos. Probamos que viene de adentro y que nadie la alteró.
- **"¿Quién emite las credenciales? ¿La empresa denunciada?"** → El emisor es un
  mock; en producción, el directorio corporativo (Azure AD), un colegio o el
  regulador.
- **"¿Por qué blockchain y no una base de datos?"** → El sello no depende de
  confiar en quien opera el servidor (que puede ser el adversario); el timestamp
  lo verifica un tercero; y la pertenencia se prueba sin que ningún servidor vea
  la credencial.
- **"¿Qué evita el spam?"** → El nullifier: una denuncia por credencial por
  época, y las épocas no son linkeables entre sí.

---

# Cambios de deck sugeridos (decisión de equipo — NO aplicados)

El panel recomendó, además de los arreglos factuales que **ya apliqué** al deck:

1. **Un solo wow.** Hoy el ✅/❌ aparece en 3 slides (5, la de dos-apps, y 11).
   Que impacte una sola vez, fuerte, en la 11 (con los bloques reales). Sacar
   los veredictos de la 5 la deja como puro mecanismo.
2. **Colapsar Nordwind 3→1.** Quedarse con la escena (slide 8, la más fuerte:
   "el canal interno lo opera el área denunciada"), plegar el remate legal en su
   figcaption, y mover Azure AD (9) al README. Recupera ~20s para el wow.
3. **Vera en la matriz de prior-art** (slide 7) como fila de arriba, con
   "autoría diferida ✕" — hace visual el punto de que ni el buque insignia de la
   Foundation la tiene.
4. **Nombre único:** PhantomTrace vs Testigo — elegir uno en repo, deck y video.
5. **375 en la slide 12** además del "48", para que coincida con lo hablado.
