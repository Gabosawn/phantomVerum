# Pitch deck — PhantomTrace

**Link para el jurado (se abre en el navegador, sin instalar nada):**

## 👉 https://claude.ai/code/artifact/e132aeac-d338-497b-8f41-8dbcf89e5dfc

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
| 11 | Honestidad | Real vs. mockeado, declarado de entrada |
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
