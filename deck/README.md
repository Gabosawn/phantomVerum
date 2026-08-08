# Pitch deck — PhantomTrace

**Link para el jurado (se abre en el navegador, sin instalar nada):**

## 👉 https://claude.ai/code/artifact/5da05683-cd06-4f1b-b76b-31405cc0903f

> **v2 (corregido, 8/8).** Reemplaza al link viejo
> `e132aeac-…` — ese tenía afirmaciones que un jurado técnico podía pinchar
> ("designated verifier", "10–30% al primero", `org` en el nullifier,
> `Transaction.merge`). Compartir SOLO este link nuevo.

---

## Para presentar (lo que dice el presentador)

- **Guion hablado, slide por slide (3–4 min):** [`guion-pitch.md`](./guion-pitch.md)
  — texto verbatim, cue de entrega por slide, cronometrado a 3:40, con las
  "trampas" (lo que no hay que decir, verificado en la auditoría) y el Q&A
  ensayado al final.
- **Teleprompter para presentar en vivo** (texto grande, cronómetro de ritmo
  verde/ámbar/rojo, cajón de Trampas + Q&A a una tecla · ← → o espacio):
  **https://claude.ai/code/artifact/b21804c9-f418-4aa8-b4de-1a4ce3e3c41b**
  · fuente en [`teleprompter.html`](./teleprompter.html). Arranca privado —
  compartir desde *Share* si lo abre otra persona.

> El guion está alineado con la auditoría del 9/8: no dice "designated
> verifier" como propiedad, no afirma que `report` publique `orgId`, y usa el
> encuadre legal defendible (Directiva UE, no el "10–30% al primero" de la SEC).

---

> ⚠️ El artifact arranca **privado**. Para que el jurado lo abra, hay que
> compartirlo desde el menú *Share* de la página (arriba a la derecha) y elegir
> acceso por link. Recién ahí la URL de arriba funciona para cualquiera.

14 slides, español, proyectable, cada una liderada por un diagrama SVG
dibujado a mano. Navegación: **← →** (o barra espaciadora), click en los
bordes, swipe en mobile, o los puntitos de abajo.

## Estructura

| # | Slide | Qué cierra |
|---|---|---|
| 01 | Portada — *el anonimato reversible* | La frase diferencial primero, no el buzón |
| 02 | El problema | Anonimato **o** recompensa · el gancho SEC |
| 03 | La solución | 3 circuitos · diagrama de frontera privado/público |
| 04 | Los 4 tiempos | Registro → denuncia → sellado → autoría diferida |
| 05 | El mecanismo | Los 3 hashes · designated verifier (verde/rojo) |
| 06 | La demo | Dual-ledger = dos dispositivos (oscuro/claro) |
| 07 | Prior art | La matriz con "¿autoría diferida?" toda en ✕ |
| 08 | **Caso · la escena** | Nordwind Logistics: por qué nadie usa el canal interno |
| 09 | **Caso · el despliegue** | Se enchufa al Azure AD que ya tienen · tamper-proof |
| 10 | **Caso · el flujo de la plata** | Lena cobra la SEC · Nordwind nunca se entera |
| 11 | Honestidad | Recibo on-chain real (4 tiempos en Preview) + límites declarados |
| 12 | La ingeniería | 48 tests, 2 backends, 13/13 mutantes muertos |
| 13 | BizDev + roadmap | SEC, Directiva UE, fiscalías · qué sigue |
| 14 | Cierre | La frase + equipo + repo |

## Diseño

Hereda el sistema visual del proyecto (`ui/shared/tokens.css`): el dual-ledger
de Midnight se traduce en dos registros — Cliente oscuro / Explorer claro. El
deck usa el registro oscuro como base y el slide de demo muestra los dos lado a
lado. Color racionado igual que el producto: **violeta** = acción/sellado,
**verde** = autoría probada, **rojo** = destinatario equivocado. La barra de
censura (lo privado que existe sin mostrarse) es el motivo recurrente.

## Editar

El deck es un solo archivo autocontenido: [`pitch.html`](./pitch.html). Se abre
directo en cualquier navegador (`file://`), sin build. Para re-publicar el link
manteniendo la misma URL, volvé a publicar ese archivo como artifact.
