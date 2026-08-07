# 01 — Arquitectura y spec de los circuitos

> Prerequisito: `00-idea.md`. Este documento especifica **semántica**, no
> sintaxis. Leer §8 antes de escribir una línea de Compact.

---

## 1. Actores

| Actor | Rol | Qué ve |
|---|---|---|
| **Organización** (ACME S.A.) | Registra el ancla de sus credenciales; emite credenciales a empleados (mock) | El ledger público. Nunca sabe quién denunció |
| **Denunciante** (el testigo) | Denuncia probando pertenencia; meses después prueba autoría | Todo lo suyo: credencial, secret, evidencia |
| **Proof server** | Genera las pruebas ZK | Los witnesses — por eso corre **local** |
| **Ledger Midnight** | Guarda hashes, nullifiers y autorías | Solo hashes. Ni identidad ni evidencia |
| **Fiscal** (verificador designado) | Recibe la prueba de autoría ligada a su clave | Lo que el denunciante le revele + el ledger |

## 2. Flujo end-to-end (los 4 tiempos de la demo)

```
T1. ACME se registra: publica el ancla de credenciales en el ledger.
    ACME emite (mock) una credencial a cada empleado, off-chain.

T2. Un empleado descubre fraude. Abre Testigo, carga la evidencia.
    La app llama a `denunciar` vía el proof server LOCAL:
      - verifica EN PRIVADO la credencial contra el ancla de ACME
      - publica: denunciaId = H(evidencia ‖ secret)  ← el sellado
                 nullifier  = H(secret ‖ orgId ‖ período)  ← anti-spam
    ACME mira el ledger: ve que HAY una denuncia. No puede saber de quién.

T3. ACME intenta alterar la evidencia. No puede: el hash está sellado
    on-chain con su posición en la cadena. Cualquier alteración no matchea.

--- meses después: el empleado quiere protección legal / recompensa ---

T4. El denunciante llama a `revelarAutoria(denunciaId, fiscalPk)`:
    prueba que conoce el preimagen de denunciaId (solo el autor lo conoce)
    SIN revelar evidencia ni secret, y liga la prueba a la clave del fiscal.
    El fiscal verifica. El empleador, si la intercepta, no puede usarla.
```

## 3. Estado del ledger (público)

```
ledger organizaciones: Map<Bytes<32>, Bytes<32>>  // orgId → ancla de credenciales
ledger denuncias:      Set<Bytes<32>>             // denunciaId sellados
ledger nullifiers:     Set<Bytes<32>>             // anti-spam por período
ledger autorias:       Set<Bytes<32>>             // H(secret ‖ denunciaId ‖ fiscalPk)
```

Todo lo demás — credencial, secret, evidencia — es witness: nunca sale de la
máquina del denunciante (salvo hacia su proof server local).

## 4. Los tres circuitos

### 4.1 `registrarOrganizacion(orgId, ancla)` — trivial

Inserta `orgId → ancla` en `organizaciones`. Falla si ya existe. Sin witnesses.
Sirve de andamio para el resto del contrato.

### 4.2 `denunciar` — el corazón

**Inputs públicos:** `orgId`, `periodo` (epoch grueso, p. ej. `2026-08`).
**Witnesses:** `credencial` (ver §5), `secret` (personal, persistente),
`evidenciaHash` (la app hashea el archivo localmente; al circuito entra el hash).

**Constraints:**

```
C1. credencialValida(credencial, organizaciones[orgId])   // ver §5
C2. assert(!nullifiers.member(nullifier))                 // una denuncia por período
```

**Valores derivados:**

```
denunciaId = H(evidenciaHash ‖ secret)     // el sellado; solo el autor conoce el preimagen
nullifier  = H(secret ‖ orgId ‖ periodo)   // una denuncia por (persona, org, período)
```

**Efectos:**

```
denuncias.insert(disclose(denunciaId))
nullifiers.insert(disclose(nullifier))
```

El nullifier evita que alguien ahogue el canal con mil denuncias falsas, sin
identificar a nadie: períodos distintos → nullifiers no linkeables.

### 4.3 `revelarAutoria(denunciaId, fiscalPk)` — el diferencial

**Inputs públicos:** `denunciaId`, `fiscalPk`.
**Witnesses:** `evidenciaHash`, `secret` — los mismos de la denuncia.

```
C1. assert(H(evidenciaHash ‖ secret) == denunciaId)   // solo el autor puede
C2. assert(denuncias.member(denunciaId))              // la denuncia existe

autorias.insert(disclose(H(secret ‖ denunciaId ‖ fiscalPk)))
```

**Por qué designated verifier:** la autoría queda ligada a *ese* fiscal. El
registro on-chain solo es interpretable por quien tenga el contexto que el
denunciante entrega off-chain al fiscal (su claim + los valores para verificar
el hash de autoría). Mostrado al empleador, el registro no prueba nada — no
puede distinguir quién lo generó ni replayearlo. Es el delta chico sobre el
circuito base que ningún juez vio nunca shipped.

## 5. La credencial — dos opciones, en orden de preferencia

El emisor es **mock declarado** (como en todos los proyectos comparables). Lo
que hay que decidir al implementar, con la stdlib instalada a la vista, es el
mecanismo de verificación en circuito. Dos opciones, en orden de preferencia:

**Opción A — Merkle membership (preferida, estándar del ecosistema):**
la organización publica como `ancla` la raíz de un árbol de Merkle de
commitments de credenciales (`H(credencialSecret)` por empleado). `denunciar`
toma la hoja y el path como witnesses y verifica la raíz en circuito.
depapp lo hizo en Compact (árbol de 1M de hojas), así que es viable; para
nosotros alcanza profundidad chica (p. ej. 8 niveles = 256 empleados).
El nullifier usa `credencialSecret` como `secret` → una credencial = una
denuncia por período. Correcto y defendible.

**Opción B — fallback de riesgo cero (solo si A no compila a tiempo):**
la organización publica `ancla = H(orgSecret)` y entrega el mismo `orgSecret`
a todos los empleados (mock). El circuito verifica `H(orgSecret) == ancla`.
Anonimato perfecto dentro de la org; **debilidad declarada:** quien tenga el
secret puede generar N nullifiers con N secrets personales (anti-spam débil) y
no hay revocación. Se presenta como límite del mock del emisor, no del diseño.

**Regla de decisión:** se intenta la Opción A primero. Si no compila en un
tiempo razonable, se congela la B y la A pasa a roadmap.

## 6. Qué resuelve y qué NO resuelve cada mecanismo

| Ataque | Mecanismo que lo mata | ¿Resuelto? |
|---|---|---|
| La empresa identifica al denunciante on-chain | Membership en ZK + tx senderless de Midnight (sin `msg.sender`, fees shielded) | ✅ |
| La empresa altera o repudia la evidencia | `denunciaId` sellado on-chain; alterar la evidencia rompe el hash | ✅ |
| Un tercero se atribuye la denuncia (roba la recompensa) | Solo el autor conoce `(evidenciaHash, secret)` — preimagen de `denunciaId` | ✅ |
| El empleador reusa/replaya la prueba de autoría | Designated verifier: la autoría está ligada a `fiscalPk` | ✅ |
| Spam / ahogar el canal con denuncias falsas | Nullifier `H(secret ‖ orgId ‖ período)` | ✅ (débil en Opción B — declarado) |
| Denuncia con contenido falso | **Ninguno.** No probamos veracidad — se dice de frente | ❌ declarado |
| Metadata off-chain (indexer ve viewing key/IP) | Proof server local + Tor/nodo propio; roadmap fee-sponsor | ⚠️ mitigado, declarado |
| Timing correlation (la denuncia sale a las 3 AM y solo Juan estaba) | Fuera de alcance; períodos gruesos ayudan | ⚠️ declarado |

## 7. Fuera de alcance (no implementar)

- Emisor de credenciales real (directorio corporativo, firma del empleador) → roadmap.
- Cifrado E2E de la evidencia hacia el fiscal → stretch, si sobra tiempo.
- Revocación de credenciales.
- Recompensas on-chain / tokens.
- Multi-chain, indexer propio, fee-sponsor (→ roadmap en el deck).

## 8. Nota obligatoria sobre sintaxis Compact

El pseudocódigo de abajo es **ilustrativo**. La sintaxis cambia entre versiones
(p. ej. `disclose()` es obligatorio para publicar valores derivados de
witnesses). **Procedimiento obligatorio, en este orden:**

1. Compilar un **template oficial sin tocarlo** primero.
2. Leer qué sintaxis usa *ese* template: `pragma`, imports de la standard
   library, tipos, firma de los hashes.
3. Adaptar esta especificación a esa sintaxis. **Adaptá la sintaxis, nunca la
   semántica.**

No inventes API. Si `persistentHash` no existe con ese nombre o aridad, usá lo
que exponga la standard library instalada. Verificar también: si Compact
expone tiempo/altura de bloque (para el sellado) o si el timestamp fino queda
como orden de inclusión + `periodo` como input público.

```compact
// PSEUDOCÓDIGO — adaptar a la versión instalada. Ver §8.

export ledger organizaciones: Map<Bytes<32>, Bytes<32>>;
export ledger denuncias: Set<Bytes<32>>;
export ledger nullifiers: Set<Bytes<32>>;
export ledger autorias: Set<Bytes<32>>;

witness credencialSecret(): Bytes<32>;
witness merklePath(): /* según stdlib instalada — solo Opción A */;
witness secretPersonal(): Bytes<32>;
witness evidenciaHash(): Bytes<32>;

export circuit registrarOrganizacion(orgId: Bytes<32>, ancla: Bytes<32>): [] {
  assert(!organizaciones.member(orgId), "organizacion ya registrada");
  organizaciones.insert(orgId, ancla);
}

export circuit denunciar(orgId: Bytes<32>, periodo: Bytes<32>): [] {
  const cred = credencialSecret();
  const sec  = secretPersonal();
  const ev   = evidenciaHash();

  // C1 — pertenencia (Opción A: verificar merklePath contra organizaciones[orgId])
  assertCredencialValida(cred, organizaciones.lookup(orgId));

  const nul = persistentHash<...>([sec, orgId, periodo]);
  assert(!nullifiers.member(disclose(nul)), "ya denunciaste este periodo");

  const id = persistentHash<...>([ev, sec]);

  denuncias.insert(disclose(id));
  nullifiers.insert(disclose(nul));
}

export circuit revelarAutoria(denunciaId: Bytes<32>, fiscalPk: Bytes<32>): [] {
  const sec = secretPersonal();
  const ev  = evidenciaHash();

  assert(persistentHash<...>([ev, sec]) == denunciaId, "no sos el autor");
  assert(denuncias.member(denunciaId), "denuncia inexistente");

  autorias.insert(disclose(persistentHash<...>([sec, denunciaId, fiscalPk])));
}
```
