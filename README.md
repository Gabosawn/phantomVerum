# Testigo — Midnight Hack Buenos Aires 2026

> **Denuncias de corrupción con anonimato reversible.** El denunciante prueba
> que es de adentro sin revelar quién es, la evidencia queda sellada — y, a
> diferencia de todos los sistemas existentes, puede probar su autoría después:
> solo él, solo ante la autoridad que elija, solo cuando le convenga.

**Evento:** 7–8 de agosto de 2026 · Niceto Vega 4866 · Beginner Track ·
**Deadline: sábado 8, 13:00 ART**

---

## Equipo

| Persona | Rol | Es dueño de |
|---|---|---|
| **GABRIEL** | Lead técnico · Infra e integración | T0 gate de compilación, T4 wiring TS + deploy, T5 proof server, merges a main, submit final |
| **JUAN** | Contratos Compact | T1 contrato backup, T2 circuitos core, T3 revelarAutoria (pair con Gabriel) |
| **GERMAN** | Frontend | T6 UI organización + denunciante, T7 vista fiscal, conexión E2E |
| **SANTIAGO** | QA y Comunicación | T8 tests + simulación, T9 deck/guion/Q&A, T10 video, T11 checklist de entrega |

Detalle de roles y cronograma hora a hora: [`docs/03-equipo.md`](docs/03-equipo.md)

## Por dónde empezar

1. **Todos:** [`docs/00-idea.md`](docs/00-idea.md) — la idea, el diferencial y por qué está verificado.
2. **Todos:** [`docs/03-equipo.md`](docs/03-equipo.md) — tu rol, tus tasks y el cronograma.
3. **Antes del viernes 10:00:** [`docs/05-setup.md`](docs/05-setup.md) — checklist de máquina. **Llegar sin esto quema medio hackathon.**
4. **Tu task concreta:** [`docs/02-tasks.md`](docs/02-tasks.md) — buscá tu nombre.

## Mapa del repo

| Carpeta | Qué va | Dueño |
|---|---|---|
| `docs/` | Idea, arquitectura, tasks, pitch, reglas | Todos |
| `contracts/` | Contratos Compact (los 3 circuitos) | Juan |
| `app/` | Wiring TypeScript: witnesses, deploy, scripts CLI | Gabriel |
| `ui/` | Frontend: 3 vistas (organización, denunciante, fiscal) | German |
| `tests/` | Tests y archivos de simulación (QA = 15 % de la nota) | Santiago |
| `deck/` | Pitch, guion de demo, Q&A, video | Santiago |

## Documentación

| Doc | Para qué |
|---|---|
| [`docs/00-idea.md`](docs/00-idea.md) | La idea final, autocontenida — empezar acá |
| [`docs/01-arquitectura.md`](docs/01-arquitectura.md) | Actores, flujo, los 3 circuitos, estado del ledger |
| [`docs/02-tasks.md`](docs/02-tasks.md) | Backlog completo con asignaciones, timeboxes y criterios |
| [`docs/03-equipo.md`](docs/03-equipo.md) | Roles, cronograma hora a hora, protocolo git y de bloqueos |
| [`docs/04-pitch-y-qa.md`](docs/04-pitch-y-qa.md) | Deck, guion de demo de 4 tiempos, Q&A duro con respuestas |
| [`docs/05-setup.md`](docs/05-setup.md) | Checklist de setup pre-evento, por persona |
| [`docs/06-reglas-checklist.md`](docs/06-reglas-checklist.md) | Gates del reglamento y checklist de entrega |
| [`docs/DESVIOS.md`](docs/DESVIOS.md) | Registro obligatorio de desvíos de sintaxis y versiones |

> El razonamiento completo detrás de la idea (investigaciones de prior art,
> anonimato transaccional y ganadores previos) vive en el paquete de
> preparación: `../docs/07-veredicto.md`, `../docs/08-idea-final.md` y
> `../docs/research/`.

## Las 3 reglas de oro

1. **Si no compila, quedamos afuera.** Descalificación automática. T0 y T1
   tienen prioridad absoluta; un contrato trivial que compila y deploya vale
   más que un circuito brillante que no.
2. **Código 100 % nuevo desde el viernes 7/8 a las 10:00.** Todo lo de esta
   carpeta es diseño y documentación — permitido. Ni una línea de Compact/TS
   del proyecto antes de esa hora.
3. **Pusheá cada hora.** Una PC apagada ya casi nos costó los reportes de
   investigación. Lo que no está pusheado no existe.

## Cómo delegar una task a una IA

Pegá esto como prompt inicial:

```
Leé estos archivos completos antes de escribir una sola línea:
- docs/00-idea.md
- docs/01-arquitectura.md
- docs/02-tasks.md (la sección de tu task)

Ejecutá la task <ID>. No cambies decisiones marcadas como CERRADA.
Si algo del spec no compila con la versión instalada de Compact, adaptá la
SINTAXIS pero no la SEMÁNTICA, y dejá anotado en docs/DESVIOS.md qué cambiaste
y por qué.
```

## Estado

- [ ] T0 — Gate de compilación *(Gabriel)*
- [ ] T1 — Contrato backup minimalista *(Juan)*
- [ ] T2 — Circuitos `registrarOrganizacion` + `denunciar` *(Juan)*
- [ ] T3 — Circuito `revelarAutoria` con designated verifier *(Juan + Gabriel)*
- [ ] T4 — Wiring TS + deploy testnet *(Gabriel)*
- [ ] T5 — Proof server local documentado *(Gabriel)*
- [ ] T6 — UI organización + denunciante *(German)*
- [ ] T7 — Vista fiscal *(German)*
- [ ] T8 — Tests + archivos de simulación *(Santiago)*
- [ ] T9 — Deck + guion + Q&A *(Santiago)*
- [ ] T10 — Video de demo *(Santiago + German)*
- [ ] T11 — Compliance y entrega *(Santiago + Gabriel)*
- [ ] T12 — Stretch: evidencia cifrada para el fiscal *(quien esté libre)*
