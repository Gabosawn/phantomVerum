# 02 — Backlog con asignaciones

> Cada task es autocontenida. Quien la ejecuta (persona o IA delegada) lee
> `00-idea.md` y `01-arquitectura.md` completos primero.
> Cronograma y sync points: `03-equipo.md`.

## Convenciones

- **No cambies decisiones marcadas CERRADA.** Si creés que una está mal,
  escribilo en `DESVIOS.md` y seguí con lo especificado.
- **Adaptá sintaxis, nunca semántica.** Anotá todo desvío en `DESVIOS.md`.
- **No inventes API.** Leé el template oficial o los docs; nada de firmas de
  memoria.
- **Timebox estricto.** Si pasás el doble del timebox, pará y reportá en el
  sync — no hay tiempo para rabbit holes. Protocolo de bloqueo en `03-equipo.md §5`.
- **Commit al cerrar cada task** con el ID en el mensaje (`T2: circuito denunciar`).
  **Push al menos cada hora** — lo que no está pusheado no existe.

## Orden de ejecución y dependencias

```
T0 ──> T1 ──> T2 ──> T3 ──────> (integración) ──> T10 video
        │      │
        │      └──> T4 wiring ──> T6 UI ──> T7 vista fiscal
        │
T5 proof server (paralelo, tras T0)
T8 tests (continuo, arranca con T1)
T9 deck (paralelo, no bloquea código)
T11 entrega (al final, checklist)
T12 stretch (solo si T0–T11 cerradas)
```

Carga por persona: **Juan** T1→T2→T3 · **Gabriel** T0→T5→T4→T3(pair)→submit ·
**German** T6→T7→integración · **Santiago** T8 continuo + T9→T10→T11.

---

## P0 — Bloqueantes del gate de descalificación

### T0 — Gate de compilación · **GABRIEL**

**Prioridad:** P0 · **Timebox:** 1 h (vie 10:00–11:00) · **Depende de:** nada
**Bloquea:** absolutamente todo

**Objetivo:** toolchain de Midnight funcionando y el template oficial
compilando **sin modificar**, antes de escribir una línea propia. En paralelo,
crear el repo público (Apache 2.0, label y topics — ver `06-reglas-checklist.md`).

**Pasos:**
1. Instalar compilador de Compact y SDK según docs vigentes (los otros tres
   validan su propia máquina con `05-setup.md` mientras tanto).
2. Clonar el template/ejemplo oficial del hackathon. Compilarlo tal cual.
3. Registrar en `DESVIOS.md`: versión del compilador, `pragma`, imports de la
   stdlib que usa el template, y si Compact expone tiempo/altura de bloque.
4. Crear el repo del equipo y dar acceso a los cuatro.

**Criterio de aceptación:**
- [ ] Template oficial compila sin errores, sin modificaciones.
- [ ] `DESVIOS.md` registra compilador + `pragma` + imports.
- [ ] Repo público creado, Apache 2.0, los 4 con acceso, primer push hecho.

**Qué NO hacer:** empezar el circuito de Testigo acá. Solo probar el entorno.

---

### T1 — Contrato backup minimalista · **JUAN**

**Prioridad:** P0 · **Timebox:** 45 min (vie 11:00–11:45) · **Depende de:** T0

**Objetivo:** un contrato Compact trivial pero **propio y temáticamente
coherente**, compilando y deployado. Es el seguro contra el gate: si el
circuito principal se atasca, esto es lo que se entrega.

**Qué implementar:** `registrarOrganizacion` de `01-arquitectura.md §4.1` —
un Map en el ledger, insertar y fallar si ya existe. Es el esqueleto del
contrato final, así que además sirve de andamio para T2.

**Criterio de aceptación:**
- [ ] Compila.
- [ ] Deployado en testnet, dirección anotada en `DESVIOS.md`.
- [ ] Un script lo invoca dos veces y confirma que la segunda falla.
- [ ] Commit hecho y **tag `backup` — no se vuelve a tocar.**

---

### T2 — Circuitos `registrarOrganizacion` + `denunciar` · **JUAN**

**Prioridad:** P0 · **Timebox:** 4 h (vie 12:00–16:00) · **Depende de:** T1

**Objetivo:** implementar los circuitos 1 y 2 según `01-arquitectura.md §4.1–4.2`.

**Decisión clave dentro de la task:** mecanismo de credencial (§5): intentar
Opción A (Merkle). **Si a las 16:00 no compila → congelar Opción B** y anotar
en `DESVIOS.md`. No negociable: a las 16:00 hay un `denunciar` que compila.

**Criterio de aceptación:**
- [ ] Compila.
- [ ] `denunciaId` y `nullifier` derivados exactamente como el spec (§4.2).
- [ ] La credencial y la evidencia **nunca** se disclosan — verificar leyendo
      el código, no solo testeando.
- [ ] Segundo `denunciar` con mismo (secret, org, período) falla; con período
      distinto pasa.
- [ ] Desvíos de sintaxis anotados en `DESVIOS.md`.

**Qué NO hacer:** no agregues outputs "por conveniencia de la UI". La UI lee
el ledger público; el circuito no emite nada extra.

---

### T3 — Circuito `revelarAutoria` (designated verifier) · **JUAN + GABRIEL (pair)**

**Prioridad:** P0 · **Timebox:** 2,5 h (vie 16:00–18:30) · **Depende de:** T2

**Objetivo:** el diferencial del proyecto — `01-arquitectura.md §4.3`. Se hace
en pair porque es la parte que nadie construyó antes y la que el jurado va a
mirar con lupa.

**Criterio de aceptación:**
- [ ] Compila.
- [ ] Con el (evidenciaHash, secret) correcto: inserta la autoría ligada a `fiscalPk`.
- [ ] Con secret ajeno: **falla en la generación de la prueba** — capturar la
      salida, va al video.
- [ ] Con `denunciaId` inexistente: falla.
- [ ] La misma autoría con otro `fiscalPk` produce un hash distinto (la prueba
      no es transferible) — test explícito.

---

### T4 — Wiring TypeScript + deploy a testnet · **GABRIEL**

**Prioridad:** P0 · **Timebox:** 3 h (vie 12:00–16:00, arranca contra T1 sin
esperar a T2) · **Depende de:** T1

**Objetivo:** ejecutar el flujo completo desde scripts: witnesses → prueba →
transacción en testnet. Es la capa que la UI de German consume.

**Incluye:**
- Witness providers de los tres circuitos.
- Generación y **persistencia local** de `secret` y credenciales (archivo).
- Deploy del contrato final y scripts de invocación:
  `registrar-org`, `denunciar`, `revelar-autoria`, `verificar-autoria` (la
  verificación off-chain que corre el fiscal).
- Hash local de la evidencia (el archivo nunca sale de la máquina).

**Criterio de aceptación:**
- [ ] Un comando corre los 4 tiempos de la demo E2E contra testnet y las tx confirman.
- [ ] El caso "secret ajeno" falla en la prueba, sin emitir transacción.
- [ ] `verificar-autoria` con la fiscalPk correcta da ✅; con otra clave da ❌.
- [ ] Dirección del contrato y hash de una tx exitosa en `DESVIOS.md`.

---

### T5 — Proof server local documentado · **GABRIEL**

**Prioridad:** P0 · **Timebox:** 1 h (vie 11:00–12:00) · **Depende de:** T0 · **Paralelizable**

**Objetivo:** proof server corriendo local, setup exacto documentado. Es parte
de la respuesta de anonimato del Q&A (los witnesses solo viajan a un proceso
local) y su terminal tiene que estar visible en la demo.

**Criterio de aceptación:**
- [ ] Comando exacto (imagen, tag, puerto) en `DESVIOS.md`, con la fuente — no
      de memoria.
- [ ] La app apunta a la instancia local, no a una remota.
- [ ] Logs visibles en una terminal — va a pantalla durante la demo y el video.

---

## P1 — Necesarios para que la demo cuente la historia

### T6 — UI: vistas organización + denunciante · **GERMAN**

**Prioridad:** P1 · **Timebox:** 4 h (vie 12:00–16:00 con mocks; 16:00–18:00
conexión real) · **Depende de:** T4 para conectar (esqueleto con mocks antes)

**Objetivo:** dos de las tres vistas. Sin diseño elaborado — legible y
proyectable (fuente grande, alto contraste).

1. **Organización:** registrar org (ancla) + "emitir credencial" (mock) + un
   panel que muestra lo que la empresa ve del ledger: hay N denuncias,
   ninguna atribuible. **Este panel es el tiempo 2 de la demo.**
2. **Denunciante:** cargar evidencia (se hashea local — decirlo en pantalla),
   elegir org y período, denunciar. Confirmación con `denunciaId` y tx.
   Botón "guardar mi llave de autoría" (secret + evidenciaHash exportados).

**Criterio de aceptación:**
- [ ] Ambas vistas contra el flujo real de T4, no mocks, antes de las 19:00.
- [ ] La vista denunciante dice explícitamente qué NO sale de la máquina.
- [ ] Legible proyectada.

**Qué NO hacer:** animaciones, theming, responsive, login.

---

### T7 — UI: vista fiscal · **GERMAN**

**Prioridad:** P1 · **Timebox:** 2 h (vie 18:00–20:00) · **Depende de:** T6, T3
**No es opcional** — es el tiempo 4, el diferencial en pantalla.

**Flujo:** el denunciante genera la prueba de autoría designada al fiscal →
el fiscal carga el `denunciaId`, su clave y el material que el denunciante le
entregó → la vista verifica contra el ledger → ✅ "autoría probada ante USTED"
o ❌.

**Criterio de aceptación:**
- [ ] Con el material correcto: verde, "autoría probada ante este fiscal".
- [ ] Con otra clave de fiscal: rojo — **este caso va al video** (la prueba no
      es transferible; es el designated verifier en vivo).
- [ ] La UI deja claro que el fiscal nunca ve la evidencia ni el secret.

---

### T8 — Tests + archivos de simulación · **SANTIAGO**

**Prioridad:** P1 · **Timebox:** continuo desde vie 12:00 · **Depende de:** va
detrás de T1→T2→T3 a medida que salen

**Objetivo:** QA es 15 % de la nota y las reglas piden literalmente
"simulation and test files" que pasen. Tres circuitos chicos = tests
exhaustivos realistas. La mayoría deja estos puntos en la mesa; nosotros no.

**Suite mínima:**
- `registrarOrganizacion`: registra ok · re-registro falla.
- `denunciar`: caso feliz · credencial inválida falla · doble denuncia mismo
  período falla · período distinto pasa · dos orgs no interfieren.
- `revelarAutoria`: autor real pasa · secret ajeno falla · denuncia
  inexistente falla · mismo autor + otro fiscal ⇒ hash distinto.
- Un script de **simulación E2E** que corre los 4 tiempos y imprime el estado
  del ledger en cada paso (además de test, es el guion del video).

**Criterio de aceptación:**
- [ ] `npm test` (o equivalente) verde en main al momento de la entrega.
- [ ] La simulación E2E corre con un solo comando.
- [ ] README documenta cómo correr ambos.

---

### T9 — Deck + guion + Q&A · **SANTIAGO**

**Prioridad:** P1 · **Timebox:** 2,5 h (vie 16:00–18:30) · **Depende de:**
`04-pitch-y-qa.md` (no bloquea ni es bloqueado por código)

**Objetivo:** producir el deck a partir de `04-pitch-y-qa.md`. El deck arranca
por el tiempo 4 (autoría diferida), no por el buzón anónimo.

**Criterio de aceptación:**
- [ ] La frase diferencial aparece en los primeros 20 segundos.
- [ ] Slide de prior art obligatoria (depapp, Dawn, SpillSafe, Catalyst,
      StealthNote) con la línea que nadie cruzó.
- [ ] Slide de limitaciones honestas (emisor mock, veracidad, metadata off-chain).
- [ ] Slide de BizDev con verificador con nombre (SEC 10–30 %, Directiva UE).
- [ ] Pitch de 60 s cronometrado **en voz alta**.
- [ ] Las respuestas del Q&A (`04-pitch-y-qa.md §3`) ensayadas con el equipo.

---

### T10 — Video de demo · **SANTIAGO + GERMAN**

**Prioridad:** P1 · **Timebox:** 1,5 h (sáb 09:30–11:00) · **Depende de:** T6, T7

**Guion — en este orden, sin cortes dentro de cada bloque:**
1. ACME se registra y emite credenciales (vista organización).
2. El empleado denuncia → la vista de ACME muestra la denuncia sin autor
   posible. Terminal del proof server **local** visible (anonimato real).
3. ACME intenta presentar una evidencia alterada → el hash no matchea.
4. **El cierre:** el denunciante prueba autoría ante el fiscal → verde. La
   misma prueba ante otra clave → rojo. *"Solo él, solo ante quien él elija."*

**Criterio de aceptación:**
- [ ] ≤ 3 min, los cuatro bloques presentes.
- [ ] Terminal del proof server local visible al menos una vez.
- [ ] Audio o subtítulos legibles.
- [ ] Subido y linkeado en el README antes de las 11:30.

---

### T11 — Compliance y entrega · **SANTIAGO (checklist) + GABRIEL (submit)**

**Prioridad:** P0 al final · **Timebox:** 1 h (sáb 11:00–12:00) · **Depende de:** todo

**Objetivo:** pasar `06-reglas-checklist.md` completo y submitear.
**Regla de la casa: submit a las 12:00, no a las 12:59.**

**Criterio de aceptación:**
- [ ] Checklist de `06-reglas-checklist.md` 100 % tildado por Santiago.
- [ ] Submit confirmado por Gabriel, screenshot de la confirmación.
- [ ] main compila, tests verdes, README completo, video linkeado.

---

## P2 — Stretch (solo si T0–T11 están cerradas)

### T12 — Evidencia cifrada para el fiscal · **quien esté libre**

**Timebox:** 2 h máx. Cifrar la evidencia con la clave del fiscal y guardar el
blob off-chain (o en un campo del contrato si es barato), de modo que al
revelar autoría el fiscal pueda leer la evidencia sin que nadie más pueda.
**Si no se hace, va al deck como roadmap igual** — la historia vale aunque el
código no esté.
