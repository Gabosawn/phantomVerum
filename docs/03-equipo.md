# 03 — Equipo, cronograma y protocolo

> Cuatro personas, 27 horas de evento, un gate que descalifica. Este doc
> define quién hace qué, cuándo nos sincronizamos y qué hacer cuando algo se
> traba. Las tasks en detalle: `02-tasks.md`.

---

## 1. Roles

### GABRIEL — Lead técnico · Infra e integración

- **Tasks:** T0 (gate de compilación), T5 (proof server), T4 (wiring TS +
  deploy), T3 en pair con Juan, submit final (T11).
- **Además:** dueño del repo y de main — todo merge pasa por él; corre los
  sync points; toma las decisiones de recorte de alcance.
- **Lectura previa:** todo `docs/`, más `../../docs/07-veredicto.md` y
  `../../docs/research/` (es quien responde el Q&A técnico de anonimato).
- Su máquina es la de referencia: ya tiene Node 24, Docker y el MCP de docs de
  Midnight; falta el compilador Compact (ver `05-setup.md`).

### JUAN — Contratos Compact

- **Tasks:** T1 (contrato backup), T2 (circuitos `registrarOrganizacion` +
  `denunciar`), T3 (`revelarAutoria`, pair con Gabriel).
- **La responsabilidad más pesada del equipo:** si su código no compila,
  quedamos descalificados. Por eso su primera entrega (T1) es trivial y se
  congela como seguro.
- **Lectura previa:** `01-arquitectura.md` completo (dos veces), en especial
  §5 (decisión de credencial) y §8 (procedimiento de sintaxis). Antes del
  evento: el tutorial oficial de Compact y el ejemplo de
  commitment/nullifier.

### GERMAN — Frontend

- **Tasks:** T6 (vistas organización + denunciante), T7 (vista fiscal),
  integración E2E con el wiring de Gabriel.
- **Estrategia:** arranca a las 12:00 con datos mock sin esperar al contrato;
  a las 16:00 cambia los mocks por el SDK real de T4. La regla de UX del
  reglamento exige frontend conectado E2E — los mocks no pueden quedar.
- **Lectura previa:** `00-idea.md` §3 (los 4 tiempos — sus pantallas SON la
  demo), `02-tasks.md` T6/T7. Antes del evento: elegir stack (lo que ya
  domine; nada de frameworks nuevos un viernes de hackathon).

### SANTIAGO — QA y Comunicación

- **Tasks:** T8 (tests + simulación, continuo), T9 (deck + guion + Q&A),
  T10 (video, con German), T11 (checklist de entrega).
- **Por qué un rol dedicado:** QA + Communication + la parte de repo prolijo
  de Engineering suman ~30 % de la nota y es lo que todos los equipos dejan
  para el final y hacen mal. Santiago lo trabaja desde el mediodía del
  viernes, no el sábado a las 11.
- **Lectura previa:** `04-pitch-y-qa.md` completo, `06-reglas-checklist.md`,
  y el criterio de aceptación de cada task (él verifica que se cumplan).

## 2. Cronograma

### Antes del viernes (cada uno en su casa)

Checklist individual de `05-setup.md`. **No negociable:** compilador Compact
respondiendo y el Hello World E2E hecho al menos en la máquina de Gabriel y la
de Juan. Llegar sin esto quema medio hackathon en setup.

### Viernes 7/8

| Hora | GABRIEL | JUAN | GERMAN | SANTIAGO |
|---|---|---|---|---|
| 09:30 | Llegada, mesa, wifi, repo | ← | ← | ← |
| 10:00–11:00 | **T0 gate** + repo público | Valida su toolchain | Valida stack UI | Estructura tests/deck |
| 11:00–12:00 | **T5 proof server** | **T1 backup** | Esqueleto UI (mocks) | Tests de T1 |
| **12:00** | **SYNC 1** — ¿T0/T1 ok? ¿riesgos? | | | |
| 12:00–16:00 | **T4 wiring** (contra T1) | **T2 circuitos core** | Vistas org + denunciante (mocks) | Tests de T2 al salir · research Q&A |
| **16:00** | **SYNC 2 — checkpoint del gate.** ¿T2 compila? Si Merkle no salió → congelar Opción B (`01-arquitectura.md §5`) | | | |
| 16:00–18:30 | **T3 pair →** | **← T3 pair** | Conectar UI al SDK real | **T9 deck + guion** |
| 18:30–19:00 | **SYNC 3** + comida | | | |
| 19:00–23:00 | Integración E2E ↔ German | Tests T3 con Santiago · fixes | **T7 vista fiscal** + integración | Tests T3 · simulación E2E |
| **23:00** | **SYNC 4 — feature freeze de Compact.** Nadie toca los circuitos salvo bug del gate. ¿Stretch T12 o pulir? | | | |
| 23:00–02:00 | Run-through demo ×2 · fixes · buffer | | | |
| 02:00–08:00 | Descanso por turnos (mínimo uno despierto si se sigue trabajando) | | | |

### Sábado 8/8 — deadline 13:00

| Hora | Qué | Quién |
|---|---|---|
| 08:00–09:30 | Run-through de demo ×2 · fixes menores · **freeze total 09:30** | Todos |
| 09:30–11:00 | **T10 video** | Santiago + German |
| 09:30–11:00 | README final, `DESVIOS.md`, limpieza de repo, deck final | Juan + Gabriel / Santiago |
| 11:00–12:00 | **T11**: checklist `06-reglas-checklist.md` + **submit** | Santiago verifica, Gabriel submitea |
| **12:00** | **Submit hecho.** No a las 12:59. | Gabriel |
| 12:00–13:00 | Buffer para desastres · ensayo del pitch en voz alta | Todos |

## 3. Sync points

Cuatro por día de trabajo, 10 minutos máximo, parados, corridos por Gabriel:

1. Cada uno: qué cerré / en qué estoy / qué me bloquea. Nada más.
2. Decisiones de recorte se toman ahí, contra el cronograma, no en el pasillo.
3. Lo decidido se anota en `DESVIOS.md` (1 línea) si cambia el plan.

## 4. Protocolo git

- **main siempre compila.** Es el gate del reglamento — un main roto a la hora
  de la entrega es descalificacion.
- Rama por task: `t2-denunciar`, `t6-ui-denunciante`.
- **Conventional Commits obligatorio:** `feat(T2): nullifier por periodo`,
  `fix(T4): corregir witness provider`, `docs: actualizar README`.
  Prefijos: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`.
- **El committer es siempre la persona, nunca el agente de IA.**
  Configurar antes de commitear: `git config user.name` y `user.email`.
- **Push como minimo cada hora** — lo que no esta pusheado no existe.
- El tag `backup` de T1 no se toca nunca: es lo que se entrega si todo lo
  demas sale mal.

## 5. Protocolo de bloqueo

Si llevás **el doble del timebox** de tu task y no cierra:

1. Pará. No es un rabbit hole que vas a ganar a la hora 18.
2. Avisá en el grupo (no esperes al sync).
3. Gabriel decide: pair, recorte de alcance, o fallback (la Opción B de
   credencial, el contrato backup, mocks declarados).
4. El desvío se anota en `DESVIOS.md`.

La jerarquía de sacrificio, en orden (lo primero que se recorta):
**T12 stretch → pulido de UI → Opción A de credencial (cae a B) → vista
organización (T6.1) → nada más.** T3 (`revelarAutoria`) no se recorta: sin él
no hay diferencial y volvemos a ser el 5º buzón anónimo.

## 6. Comunicación

- Grupo de WhatsApp/Telegram del equipo (crear antes del viernes).
- Discord del evento: canal #hack-buenos-aires y announcements — **Santiago
  monitorea** los anuncios de la organización (cambios de horario, formato de
  entrega).
- Cualquier duda de reglas la resuelve Santiago contra el PDF oficial, no
  contra la memoria de nadie.
